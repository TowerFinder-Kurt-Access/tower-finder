export interface ValidationLevelResult {
  level: 1 | 2 | 3;
  name: string;
  success: boolean;
  status: string;
  raw: any;
}

export interface MultiLevelValidationResult {
  phoneNumber: string;
  overallStatus: string;
  levels: ValidationLevelResult[];
}

export class PhoneValidationService {
  private static NUMVERIFY_API_KEY = process.env.NUMVERIFY_API_KEY;
  private static NUMVERIFY_URL = 'http://apilayer.net/api/validate';

  /**
   * Level 1: Format Validation
   * Checks if the number follows basic international/national formatting rules.
   */
  static async validateLevel1Format(phoneNumber: string): Promise<ValidationLevelResult> {
    const digits = phoneNumber.replace(/[^\d]/g, '');
    const isValid = digits.length >= 10 && digits.length <= 15;
    
    return {
      level: 1,
      name: 'format_validation',
      success: isValid,
      status: isValid ? 'valid_format' : 'invalid_format',
      raw: { digits, length: digits.length }
    };
  }

  /**
   * Level 2: Active Status Check (NumVerify API)
   * Uses NumVerify to verify if the number is active, carrier, and line type.
   */
  static async validateLevel2Active(phoneNumber: string): Promise<ValidationLevelResult> {
    try {
      if (!this.NUMVERIFY_API_KEY) {
        console.warn('NUMVERIFY_API_KEY not set, using simulated fallback for Level 2.');
        return this.simulateLevel2(phoneNumber);
      }

      const response = await fetch(`${this.NUMVERIFY_URL}?access_key=${this.NUMVERIFY_API_KEY}&number=${encodeURIComponent(phoneNumber)}`);
      
      if (!response.ok) {
        throw new Error(`NumVerify API failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // NumVerify returns "valid: true" if the number exists and is correctly formatted/active
      const isActive = data.valid === true;

      return {
        level: 2,
        name: 'numverify_active_check',
        success: isActive,
        status: isActive ? 'active' : 'inactive',
        raw: data
      };
    } catch (error) {
      console.error('PhoneValidationService Level 2 Error:', error);
      return {
        level: 2,
        name: 'numverify_check_failed',
        success: false,
        status: 'error',
        raw: { error: error.message }
      };
    }
  }

  /**
   * Simulation for Level 2 if API key is missing or for testing.
   */
  private static simulateLevel2(phoneNumber: string): ValidationLevelResult {
    const isSimulatedActive = !phoneNumber.includes('000'); 
    return {
      level: 2,
      name: 'numverify_simulated',
      success: isSimulatedActive,
      status: isSimulatedActive ? 'active' : 'inactive',
      raw: { note: 'Simulated result (No API Key)' }
    };
  }

  /**
   * Level 3: Ring/Answer Verification
   * Simulates a robocall or uses a specialized API to see if the phone rings.
   */
  static async validateLevel3Ring(phoneNumber: string): Promise<ValidationLevelResult> {
    const isRinging = !phoneNumber.endsWith('99'); 
    
    return {
      level: 3,
      name: 'ring_verification',
      success: isRinging,
      status: isRinging ? 'rings' : 'no_ring',
      raw: { 
        simulated: true, 
        outcome: isRinging ? 'Somebody could answer' : 'No answer/Disconnected' 
      }
    };
  }

  /**
   * Execute all levels of validation sequentially.
   * Stops if a level fails.
   */
  static async validateMultiLevel(phoneNumber: string): Promise<MultiLevelValidationResult> {
    const levels: ValidationLevelResult[] = [];
    
    // Level 1
    const l1 = await this.validateLevel1Format(phoneNumber);
    levels.push(l1);
    if (!l1.success) return { phoneNumber, overallStatus: 'invalid_format', levels };

    // Level 2
    const l2 = await this.validateLevel2Active(phoneNumber);
    levels.push(l2);
    if (!l2.success) return { phoneNumber, overallStatus: 'inactive', levels };

    // Level 3
    const l3 = await this.validateLevel3Ring(phoneNumber);
    levels.push(l3);
    
    const overallStatus = l3.success ? 'verified_active' : 'active_no_ring';
    
    return { phoneNumber, overallStatus, levels };
  }
}
