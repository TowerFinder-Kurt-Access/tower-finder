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
  private static NUMVERIFY_URL = 'https://apilayer.net/api/validate';

  /**
   * Level 1: Format Validation
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
   * Includes specific handling for API Quotas.
   */
  static async validateLevel2Active(phoneNumber: string): Promise<ValidationLevelResult> {
    try {
      if (!this.NUMVERIFY_API_KEY) {
        return this.simulateLevel2(phoneNumber);
      }

      const response = await fetch(`${this.NUMVERIFY_URL}?access_key=${this.NUMVERIFY_API_KEY}&number=${encodeURIComponent(phoneNumber)}`);
      
      if (!response.ok) {
        throw new Error(`NumVerify API failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle NumVerify Quota or API Errors
      if (data.success === false && data.error) {
        const errorType = data.error.type || 'unknown_error';
        const isQuotaReached = data.error.code === 104 || data.error.code === 101; // 104: Usage limit, 101: Invalid key
        
        return {
          level: 2,
          name: 'numverify_active_check',
          success: false,
          status: isQuotaReached ? 'api_quota_reached' : 'api_error',
          raw: data.error
        };
      }

      const isActive = data.valid === true;

      return {
        level: 2,
        name: 'numverify_active_check',
        success: isActive,
        status: isActive ? 'active' : 'inactive',
        raw: data
      };
    } catch (error) {
      return {
        level: 2,
        name: 'numverify_check_failed',
        success: false,
        status: 'connection_error',
        raw: { error: error.message }
      };
    }
  }

  /**
   * Level 3: Ring/Answer Verification
   * Set to "waiting_for_implementation" until a real API is connected.
   */
  static async validateLevel3Ring(phoneNumber: string): Promise<ValidationLevelResult> {
    // Current requirement: Step 3 will not show success until an API key is added.
    return {
      level: 3,
      name: 'ring_verification',
      success: false, // Not "success" until actual implementation
      status: 'waiting_for_implementation',
      raw: { note: 'Robocaller API integration required for Level 3 verification' }
    };
  }

  /**
   * Execute all levels of validation sequentially.
   */
  static async validateMultiLevel(phoneNumber: string): Promise<MultiLevelValidationResult> {
    const levels: ValidationLevelResult[] = [];
    
    // Level 1: Format
    const l1 = await this.validateLevel1Format(phoneNumber);
    levels.push(l1);
    if (!l1.success) return { phoneNumber, overallStatus: 'invalid_format', levels };

    // Level 2: Active (NumVerify)
    const l2 = await this.validateLevel2Active(phoneNumber);
    levels.push(l2);
    
    // If quota reached or error, we stop and mark as 'pending_api'
    if (l2.status === 'api_quota_reached') {
        return { phoneNumber, overallStatus: 'validation_throttled', levels };
    }
    if (!l2.success) return { phoneNumber, overallStatus: 'inactive', levels };

    // Level 3: Ring
    const l3 = await this.validateLevel3Ring(phoneNumber);
    levels.push(l3);
    
    // Overall status is 'active' after Level 2, but not 'verified_active' until Level 3
    const overallStatus = l3.status === 'rings' ? 'verified_active' : 'active_status_only';
    
    return { phoneNumber, overallStatus, levels };
  }

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
}
