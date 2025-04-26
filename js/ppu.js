export class PPU {
    constructor(mmu, ctx) {
        this.mmu = mmu;
        this.ctx = ctx;
        
        // Screen dimensions
        this.WIDTH = 160;
        this.HEIGHT = 144;
        
        // Create image data buffer
        this.imageData = this.ctx.createImageData(this.WIDTH, this.HEIGHT);
        this.frameBuffer = new Uint32Array(this.imageData.data.buffer);
        
        // PPU mode variables
        this.mode = 0;
        this.line = 0;
        this.dotCounter = 0;
        
        // DMG palette colors (light to dark)
        this.colors = [
            0xFFFFFFFF, // White
            0xFFAAAAAA, // Light gray
            0xFF555555, // Dark gray
            0xFF000000  // Black
        ];
        
        this.reset();
    }
    
    reset() {
        // Initialize registers
        this.lcdc = 0x91; // LCD Control
        this.stat = 0x00; // LCD Status
        this.scy = 0x00;  // Scroll Y
        this.scx = 0x00;  // Scroll X
        this.ly = 0x00;   // LCD Y-coordinate
        this.lyc = 0x00;  // LY Compare
        this.bgp = 0xFC;  // BG Palette Data
        this.obp0 = 0xFF; // Object Palette 0 Data
        this.obp1 = 0xFF; // Object Palette 1 Data
        this.wy = 0x00;   // Window Y Position
        this.wx = 0x00;   // Window X Position minus 7
        
        this.mode = 2;    // Start in OAM scan mode
        this.line = 0;
        this.dotCounter = 0;
        
        // Clear the screen
        this.frameBuffer.fill(this.colors[0]);
        this.ctx.putImageData(this.imageData, 0, 0);
    }
    
    read(address) {
        switch (address) {
            case 0xFF40: return this.lcdc;
            case 0xFF41: return this.stat | 0x80 | this.mode; // Bit 7 always set, bits 0-1 are mode
            case 0xFF42: return this.scy;
            case 0xFF43: return this.scx;
            case 0xFF44: return this.ly;
            case 0xFF45: return this.lyc;
            case 0xFF47: return this.bgp;
            case 0xFF48: return this.obp0;
            case 0xFF49: return this.obp1;
            case 0xFF4A: return this.wy;
            case 0xFF4B: return this.wx;
            default: return 0xFF;
        }
    }
    
    write(address, value) {
        switch (address) {
            case 0xFF40: 
                // Check if LCD is being turned off
                if ((this.lcdc & 0x80) && !(value & 0x80)) {
                    // LCD turned off - reset PPU state
                    this.mode = 0;
                    this.line = 0;
                    this.dotCounter = 0;
                    // Clear the screen when LCD is disabled
                    this.frameBuffer.fill(this.colors[0]);
                    this.ctx.putImageData(this.imageData, 0, 0);
                }
                this.lcdc = value;
                break;
            case 0xFF41: this.stat = (value & 0x78) | (this.stat & 0x07); break; // Only bits 3-6 are writable
            case 0xFF42: this.scy = value; break;
            case 0xFF43: this.scx = value; break;
            case 0xFF44: break; // LY is read-only
            case 0xFF45: this.lyc = value; break;
            case 0xFF47: this.bgp = value; break;
            case 0xFF48: this.obp0 = value; break;
            case 0xFF49: this.obp1 = value; break;
            case 0xFF4A: this.wy = value; break;
            case 0xFF4B: this.wx = value; break;
        }
    }
    
    inVRAMAccessibleMode() {
        // VRAM is accessible in modes 0, 1, 2 (not 3)
        return this.isLCDEnabled() ? this.mode !== 3 : true;
    }
    
    inOAMAccessibleMode() {
        // OAM is accessible in modes 0, 1 (not 2, 3)
        return this.isLCDEnabled() ? (this.mode < 2) : true;
    }
    
    isLCDEnabled() {
        return (this.lcdc & 0x80) !== 0;
    }
    
    step(cycles) {
        if (!this.isLCDEnabled()) {
            return;
        }
        
        this.dotCounter += cycles;
        
        // Mode durations in dots
        // Mode 2 (OAM scan): 80 dots
        // Mode 3 (Pixel transfer): 172-289 dots
        // Mode 0 (HBlank): 87-204 dots to complete 456 dots per line
        // Mode 1 (VBlank): 4560 dots (10 lines)
        
        let requestInterrupt = false;
        
        switch (this.mode) {
            case 0: // HBlank
                if (this.dotCounter >= 456) {
                    this.dotCounter -= 456;
                    this.line++;
                    
                    if (this.line === 144) {
                        // Enter VBlank
                        this.mode = 1;
                        
                        // Request VBlank interrupt
                        this.mmu.writeByte(0xFF0F, this.mmu.readByte(0xFF0F) | 0x01);
                        
                        // Request STAT interrupt if enabled
                        if (this.stat & 0x10) {
                            requestInterrupt = true;
                        }
                        
                        // Render frame at end of last scanline
                        this.ctx.putImageData(this.imageData, 0, 0);
                    } else {
                        // Back to OAM scan for next line
                        this.mode = 2;
                        
                        // Request STAT interrupt if enabled
                        if (this.stat & 0x20) {
                            requestInterrupt = true;
                        }
                    }
                    
                    // Check LYC=LY coincidence
                    if (this.line === this.lyc) {
                        this.stat |= 0x04; // Set coincidence flag
                        if (this.stat & 0x40) {
                            requestInterrupt = true;
                        }
                    } else {
                        this.stat &= ~0x04; // Clear coincidence flag
                    }
                }
                break;
                
            case 1: // VBlank
                if (this.dotCounter >= 456) {
                    this.dotCounter -= 456;
                    this.line++;
                    
                    // Check LYC=LY coincidence
                    if (this.line === this.lyc) {
                        this.stat |= 0x04; // Set coincidence flag
                        if (this.stat & 0x40) {
                            requestInterrupt = true;
                        }
                    } else {
                        this.stat &= ~0x04; // Clear coincidence flag
                    }
                    
                    if (this.line > 153) {
                        // VBlank finished, restart from line 0
                        this.mode = 2;
                        this.line = 0;
                        
                        // Request STAT interrupt if enabled
                        if (this.stat & 0x20) {
                            requestInterrupt = true;
                        }
                        
                        // Check LYC=LY coincidence again for line 0
                        if (this.line === this.lyc) {
                            this.stat |= 0x04; // Set coincidence flag
                            if (this.stat & 0x40) {
                                requestInterrupt = true;
                            }
                        } else {
                            this.stat &= ~0x04; // Clear coincidence flag
                        }
                    }
                }
                break;
                
            case 2: // OAM Scan
                if (this.dotCounter >= 80) {
                    // Enter pixel transfer mode
                    this.mode = 3;
                }
                break;
                
            case 3: // Pixel Transfer
                // Duration varies, but a safe estimate is around 172-289 dots
                // We'll use ~172 for simplicity
                if (this.dotCounter >= 252) {
                    // Render scanline
                    this.renderScanline();
                    
                    // Enter HBlank
                    this.mode = 0;
                    
                    // Request STAT interrupt if enabled
                    if (this.stat & 0x08) {
                        requestInterrupt = true;
                    }
                }
                break;
        }
        
        // Request STAT interrupt if needed
        if (requestInterrupt) {
            this.mmu.writeByte(0xFF0F, this.mmu.readByte(0xFF0F) | 0x02);
        }
    }
    
    renderScanline() {
        // Get LCD control flags
        const bgEnabled = (this.lcdc & 0x01) !== 0;
        const windowEnabled = (this.lcdc & 0x20) !== 0 && this.wy <= this.line;
        const spritesEnabled = (this.lcdc & 0x02) !== 0;
        
        // Background and window tile data area
        const tileDataArea = (this.lcdc & 0x10) ? 0x8000 : 0x9000;
        const unsignedTileIds = (this.lcdc & 0x10) !== 0;
        
        // Background tile map area
        const bgTileMapArea = (this.lcdc & 0x08) ? 0x9C00 : 0x9800;
        
        // Window tile map area
        const windowTileMapArea = (this.lcdc & 0x40) ? 0x9C00 : 0x9800;
        
        // Prepare an array for the scanline pixels (prioritized)
        // Each element will have: { color, bgPriority }
        const scanlinePixels = new Array(this.WIDTH).fill().map(() => ({ color: 0, bgPriority: false }));
        
        // Render background (if enabled)
        if (bgEnabled) {
            this.renderBackground(scanlinePixels, tileDataArea, bgTileMapArea, unsignedTileIds);
        } else {
            // If background is disabled, fill with white
            for (let x = 0; x < this.WIDTH; x++) {
                scanlinePixels[x].color = 0;
            }
        }
        
        // Render window (if enabled and visible on this scanline)
        if (windowEnabled && this.wx <= 166) {
            this.renderWindow(scanlinePixels, tileDataArea, windowTileMapArea, unsignedTileIds);
        }
        
        // Render sprites (if enabled)
        if (spritesEnabled) {
            this.renderSprites(scanlinePixels);
        }
        
        // Convert pixel data to actual colors and write to frame buffer
        const lineOffset = this.line * this.WIDTH;
        for (let x = 0; x < this.WIDTH; x++) {
            this.frameBuffer[lineOffset + x] = this.colors[scanlinePixels[x].color];
        }
    }
    
    renderBackground(scanlinePixels, tileDataArea, tileMapArea, unsignedTileIds) {
        // Calculate which row of tiles the current scanline is on
        const yPos = (this.line + this.scy) & 0xFF;
        const tileRow = Math.floor(yPos / 8);
        
        // Which row of pixels within the tile
        const tilePixelRow = yPos % 8;
        
        for (let x = 0; x < this.WIDTH; x++) {
            // Calculate which column of tiles the current x position is on
            const xPos = (x + this.scx) & 0xFF;
            const tileCol = Math.floor(xPos / 8);
            
            // Which column of pixels within the tile
            const tilePixelCol = xPos % 8;
            
            // Get the tile ID from the tile map
            const tileMapAddress = tileMapArea + (tileRow * 32) + tileCol;
            const tileId = this.mmu.readByte(tileMapAddress);
            
            // Get the tile data address
            let tileAddress;
            if (unsignedTileIds) {
                tileAddress = tileDataArea + (tileId * 16);
            } else {
                tileAddress = tileDataArea + ((tileId << 24 >> 24) * 16);
            }
            
            // Each tile row uses 2 bytes
            const tileDataLow = this.mmu.readByte(tileAddress + (tilePixelRow * 2));
            const tileDataHigh = this.mmu.readByte(tileAddress + (tilePixelRow * 2) + 1);
            
            // Get the pixel color (combining high and low bits)
            const colorBit = 7 - tilePixelCol;
            const colorLow = (tileDataLow >> colorBit) & 1;
            const colorHigh = ((tileDataHigh >> colorBit) & 1) << 1;
            const colorId = colorHigh | colorLow;
            
            // Map to actual color through BGP palette
            const color = (this.bgp >> (colorId * 2)) & 0x03;
            
            // Set pixel data
            scanlinePixels[x].color = color;
            scanlinePixels[x].bgPriority = colorId > 0; // Non-zero background pixels can have priority
        }
    }
    
    renderWindow(scanlinePixels, tileDataArea, tileMapArea, unsignedTileIds) {
        // Only draw the window if it's visible on this scanline
        if (this.line < this.wy) return;
        
        // Calculate which row of window we're drawing
        const windowY = this.line - this.wy;
        const tileRow = Math.floor(windowY / 8);
        
        // Which row of pixels within the tile
        const tilePixelRow = windowY % 8;
        
        // The window X position is offset by 7
        const windowXPos = this.wx - 7;
        
        for (let x = 0; x < this.WIDTH; x++) {
            // Skip pixels before the window starts
            if (x < windowXPos) continue;
            
            // Calculate tile and pixel position
            const windowX = x - windowXPos;
            const tileCol = Math.floor(windowX / 8);
            const tilePixelCol = windowX % 8;
            
            // Get the tile ID from the window tile map
            const tileMapAddress = tileMapArea + (tileRow * 32) + tileCol;
            const tileId = this.mmu.readByte(tileMapAddress);
            
            // Get the tile data address
            let tileAddress;
            if (unsignedTileIds) {
                tileAddress = tileDataArea + (tileId * 16);
            } else {
                tileAddress = tileDataArea + ((tileId << 24 >> 24) * 16);
            }
            
            // Each tile row uses 2 bytes
            const tileDataLow = this.mmu.readByte(tileAddress + (tilePixelRow * 2));
            const tileDataHigh = this.mmu.readByte(tileAddress + (tilePixelRow * 2) + 1);
            
            // Get the pixel color (combining high and low bits)
            const colorBit = 7 - tilePixelCol;
            const colorLow = (tileDataLow >> colorBit) & 1;
            const colorHigh = ((tileDataHigh >> colorBit) & 1) << 1;
            const colorId = colorHigh | colorLow;
            
            // Map to actual color through BGP palette
            const color = (this.bgp >> (colorId * 2)) & 0x03;
            
            // Set pixel data
            scanlinePixels[x].color = color;
            scanlinePixels[x].bgPriority = colorId > 0; // Non-zero window pixels can have priority
        }
    }
    
    renderSprites(scanlinePixels) {
        // Sprite size: 8x8 or 8x16 based on LCDC bit 2
        const spriteHeight = (this.lcdc & 0x04) ? 16 : 8;
        
        // Array to store visible sprites on this line (max 10 per line)
        const visibleSprites = [];
        
        // Scan OAM for sprites visible on this scanline (max 40 sprites total)
        for (let i = 0; i < 40; i++) {
            const oamIndex = i * 4;
            const yPos = this.mmu.readByte(0xFE00 + oamIndex) - 16;
            
            // Check if sprite is visible on this scanline
            if (this.line >= yPos && this.line < yPos + spriteHeight) {
                const xPos = this.mmu.readByte(0xFE00 + oamIndex + 1) - 8;
                const tileId = this.mmu.readByte(0xFE00 + oamIndex + 2);
                const attributes = this.mmu.readByte(0xFE00 + oamIndex + 3);
                
                // Add to visible sprites (store x position for sorting)
                visibleSprites.push({
                    x: xPos,
                    y: yPos,
                    tileId,
                    attributes,
                    oamIndex // Store for priority (lower OAM index = higher priority)
                });
                
                // Only process 10 sprites per line (hardware limit)
                if (visibleSprites.length >= 10) break;
            }
        }
        
        // Sort sprites by x-coordinate (for proper priority handling)
        // When sprites overlap, the one with the lowest x-coordinate has priority
        // If x is equal, the one with the lowest OAM index has priority
        visibleSprites.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            return a.oamIndex - b.oamIndex;
        });
        
        // Render sprites in order (from lowest to highest priority)
        for (const sprite of visibleSprites.reverse()) {
            const xFlip = (sprite.attributes & 0x20) !== 0;
            const yFlip = (sprite.attributes & 0x40) !== 0;
            const priority = (sprite.attributes & 0x80) !== 0;
            const palette = (sprite.attributes & 0x10) !== 0 ? this.obp1 : this.obp0;
            
            // Calculate which row of the sprite we're on
            let row = this.line - sprite.y;
            if (yFlip) row = spriteHeight - 1 - row;
            
            // For 8x16 sprites, the tileId is forced to be even
            let tileId = sprite.tileId;
            if (spriteHeight === 16) {
                // Top half or bottom half tile based on row
                tileId = (tileId & 0xFE) + (row >= 8 ? 1 : 0);
                // Adjust row for the selected tile
                row %= 8;
            }
            
            // Get the sprite data (2 bytes per row)
            const tileAddress = 0x8000 + (tileId * 16) + (row * 2);
            const spriteLow = this.mmu.readByte(tileAddress);
            const spriteHigh = this.mmu.readByte(tileAddress + 1);
            
            // Draw sprite pixels
            for (let pixelX = 0; pixelX < 8; pixelX++) {
                // Skip if sprite pixel is off-screen
                const x = sprite.x + pixelX;
                if (x < 0 || x >= this.WIDTH) continue;
                
                // Get the pixel depending on horizontal flip
                const bit = xFlip ? pixelX : 7 - pixelX;
                const colorLow = (spriteLow >> bit) & 1;
                const colorHigh = ((spriteHigh >> bit) & 1) << 1;
                const colorId = colorHigh | colorLow;
                
                // Skip transparent pixels (color 0)
                if (colorId === 0) continue;
                
                // Check BG-to-OBJ priority: 
                // - If this sprite has priority bit set, only show it on color 0 BG
                // - If the BG pixel has the priority bit set, don't draw the sprite
                if (priority && scanlinePixels[x].bgPriority) {
                    continue;
                }
                
                // Map color through the appropriate palette
                const color = (palette >> (colorId * 2)) & 0x03;
                
                // Set the pixel
                scanlinePixels[x].color = color;
            }
        }
    }
}

