export class Cartridge {
    constructor() {
        this.rom = null;
        this.ram = null;
        
        // MBC state
        this.mbcType = 0;
        this.romBank = 1;
        this.ramBank = 0;
        this.ramEnabled = false;
        this.romMode = true; // true = ROM mode, false = RAM mode (for MBC1)
        
        // ROM/RAM sizes
        this.romSize = 0;
        this.ramSize = 0;
        
        this.title = "";
    }
    
    load(romData) {
        this.rom = romData;
        
        // Parse cartridge header
        this.parseHeader();
        
        // Initialize RAM if needed
        if (this.ramSize > 0) {
            this.ram = new Uint8Array(this.ramSize);
        }
        
        console.log(`Loaded ROM: ${this.title}`);
        console.log(`Cartridge type: ${this.mbcType.toString(16)}, ROM size: ${this.romSize}, RAM size: ${this.ramSize}`);
    }
    
    parseHeader() {
        // Extract title (at $0134-$0143)
        let title = "";
        for (let i = 0x134; i < 0x144; i++) {
            if (this.rom[i] === 0) break;
            title += String.fromCharCode(this.rom[i]);
        }
        this.title = title;
        
        // Get cartridge type (at $0147)
        this.mbcType = this.rom[0x147];
        
        // Get ROM size (at $0148)
        switch (this.rom[0x148]) {
            case 0x00: this.romSize = 32 * 1024; break; // 32KB (2 banks)
            case 0x01: this.romSize = 64 * 1024; break; // 64KB (4 banks)
            case 0x02: this.romSize = 128 * 1024; break; // 128KB (8 banks)
            case 0x03: this.romSize = 256 * 1024; break; // 256KB (16 banks)
            case 0x04: this.romSize = 512 * 1024; break; // 512KB (32 banks)
            case 0x05: this.romSize = 1024 * 1024; break; // 1MB (64 banks)
            case 0x06: this.romSize = 2 * 1024 * 1024; break; // 2MB (128 banks)
            case 0x07: this.romSize = 4 * 1024 * 1024; break; // 4MB (256 banks)
            case 0x08: this.romSize = 8 * 1024 * 1024; break; // 8MB (512 banks)
            default: this.romSize = 32 * 1024; break;
        }
        
        // Get RAM size (at $0149)
        switch (this.rom[0x149]) {
            case 0x00: this.ramSize = 0; break; // No RAM
            case 0x01: this.ramSize = 2 * 1024; break; // 2KB (1 bank)
            case 0x02: this.ramSize = 8 * 1024; break; // 8KB (1 bank)
            case 0x03: this.ramSize = 32 * 1024; break; // 32KB (4 banks)
            case 0x04: this.ramSize = 128 * 1024; break; // 128KB (16 banks)
            case 0x05: this.ramSize = 64 * 1024; break; // 64KB (8 banks)
            default: this.ramSize = 0; break;
        }
    }
    
    getTitle() {
        return this.title;
    }
    
    read(address) {
        // ROM bank 0 is always mapped to 0x0000-0x3FFF
        if (address < 0x4000) {
            return this.rom[address];
        }
        
        // Switchable ROM bank is mapped to 0x4000-0x7FFF
        if (address < 0x8000) {
            const bankAddress = (this.romBank * 0x4000) + (address - 0x4000);
            return bankAddress < this.rom.length ? this.rom[bankAddress] : 0xFF;
        }
        
        return 0xFF; // Should not reach here
    }
    
    write(address, value) {
        // Handle MBC registers
        switch (this.mbcType) {
            case 0x00: // ROM ONLY
                // ROM is read-only, writes do nothing
                break;
                
            case 0x01: // MBC1
            case 0x02: // MBC1+RAM
            case 0x03: // MBC1+RAM+BATTERY
                this.writeMBC1(address, value);
                break;
                
            case 0x05: // MBC2
            case 0x06: // MBC2+BATTERY
                this.writeMBC2(address, value);
                break;
                
            case 0x0F: // MBC3+TIMER+BATTERY
            case 0x10: // MBC3+TIMER+RAM+BATTERY
            case 0x11: // MBC3
            case 0x12: // MBC3+RAM
            case 0x13: // MBC3+RAM+BATTERY
                this.writeMBC3(address, value);
                break;
                
            case 0x19: // MBC5
            case 0x1A: // MBC5+RAM
            case 0x1B: // MBC5+RAM+BATTERY
            case 0x1C: // MBC5+RUMBLE
            case 0x1D: // MBC5+RUMBLE+RAM
            case 0x1E: // MBC5+RUMBLE+RAM+BATTERY
                this.writeMBC5(address, value);
                break;
                
            default:
                // Unsupported MBC type, silently ignore
                break;
        }
    }
    
    writeMBC1(address, value) {
        if (address < 0x2000) {
            // RAM Enable (0x0000-0x1FFF)
            this.ramEnabled = (value & 0x0F) === 0x0A;
        }
        else if (address < 0x4000) {
            // ROM Bank Number (0x2000-0x3FFF)
            value &= 0x1F; // 5 bits for bank number
            if (value === 0) value = 1; // Bank 0 is not allowed here
            this.romBank = (this.romBank & 0x60) | value;
        }
        else if (address < 0x6000) {
            // RAM Bank Number or Upper Bits of ROM Bank Number (0x4000-0x5FFF)
            value &= 0x03; // 2 bits
            if (this.romMode) {
                // ROM mode: upper bits of ROM bank
                this.romBank = (this.romBank & 0x1F) | (value << 5);
            } else {
                // RAM mode: RAM bank number
                this.ramBank = value;
            }
        }
        else if (address < 0x8000) {
            // ROM/RAM Mode Select (0x6000-0x7FFF)
            this.romMode = (value & 0x01) === 0;
            if (this.romMode) {
                this.ramBank = 0;
            }
        }
    }
    
    writeMBC2(address, value) {
        if (address < 0x2000) {
            // RAM Enable
            if ((address & 0x0100) === 0) {
                this.ramEnabled = (value & 0x0F) === 0x0A;
            }
        }
        else if (address < 0x4000) {
            // ROM Bank Number
            if ((address & 0x0100) !== 0) {
                value &= 0x0F; // 4 bits for bank number
                if (value === 0) value = 1; // Bank 0 is not allowed here
                this.romBank = value;
            }
        }
    }
    
    writeMBC3(address, value) {
        if (address < 0x2000) {
            // RAM and Timer Enable (0x0000-0x1FFF)
            this.ramEnabled = (value & 0x0F) === 0x0A;
        }
        else if (address < 0x4000) {
            // ROM Bank Number (0x2000-0x3FFF)
            value &= 0x7F; // 7 bits for bank number
            if (value === 0) value = 1; // Bank 0 is not allowed here
            this.romBank = value;
        }
        else if (address < 0x6000) {
            // RAM Bank Number or RTC Register Select (0x4000-0x5FFF)
            if (value <= 0x03) {
                // RAM bank
                this.ramBank = value;
            }
            // 0x08-0x0C would select RTC registers, but we don't implement RTC
        }
        // 0x6000-0x7FFF would be Latch Clock Data for RTC
    }
    
    writeMBC5(address, value) {
        if (address < 0x2000) {
            // RAM Enable (0x0000-0x1FFF)
            this.ramEnabled = (value & 0x0F) === 0x0A;
        }
        else if (address < 0x3000) {
            // Low 8 bits of ROM Bank Number (0x2000-0x2FFF)
            this.romBank = (this.romBank & 0x100) | value;
        }
        else if (address < 0x4000) {
            // 9th bit of ROM Bank Number (0x3000-0x3FFF)
            this.romBank = (this.romBank & 0xFF) | ((value & 0x01) << 8);
        }
        else if (address < 0x6000) {
            // RAM Bank Number (0x4000-0x5FFF)
            this.ramBank = value & 0x0F;
        }
    }
    
    readRAM(address) {
        if (!this.ramEnabled || !this.ram) return 0xFF;
        
        // Calculate RAM address based on bank
        const bankAddress = (this.ramBank * 0x2000) + address;
        return bankAddress < this.ram.length ? this.ram[bankAddress] : 0xFF;
    }
    
    writeRAM(address, value) {
        if (!this.ramEnabled || !this.ram) return;
        
        // Calculate RAM address based on bank
        const bankAddress = (this.ramBank * 0x2000) + address;
        if (bankAddress < this.ram.length) {
            this.ram[bankAddress] = value;
        }
    }
}

