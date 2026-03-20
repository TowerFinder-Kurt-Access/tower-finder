export interface PhoneValidationResult {
  provider: string;
  valid: boolean;
  number: string;
  local_format?: string;
  international_format?: string;
  country_code?: string;
  carrier?: string;
  line_type?: string;
  raw: any;
}

export class PhoneValidationService {
  private static PROVIDERS = [
    { name: 'numvalidate', url: 'https://numvalidate.com/api/validate' },
    { name: 'tinyfn', url: 'https://tinyfn.com/api/phone/validate' }
  ];

  /**
   * Validate a phone number using a specific provider
   */
  static async validateWithProvider(phoneNumber: string, provider: { name: string, url: string }): Promise<PhoneValidationResult> {
    try {
      const response = await fetch(`${provider.url}?number=${encodeURIComponent(phoneNumber)}`);
      
      if (!response.ok) {
        throw new Error(`Provider ${provider.name} failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Mapping logic for different providers
      if (provider.name === 'numvalidate') {
        return {
          provider: provider.name,
          valid: data.valid === true,
          number: data.number,
          local_format: data.local_format,
          international_format: data.international_format,
          country_code: data.country_code,
          carrier: data.carrier,
          line_type: data.line_type,
          raw: data
        };
      } else if (provider.name === 'tinyfn') {
        return {
          provider: provider.name,
          valid: data.isValid === true,
          number: data.phoneNumber,
          international_format: data.e164,
          country_code: data.countryCode,
          carrier: data.carrier,
          raw: data
        };
      }

      throw new Error(`Unknown provider: ${provider.name}`);
    } catch (error) {
      console.warn(`Validation with ${provider.name} failed, using local fallback.`);
      return this.localFallback(phoneNumber, provider.name, error.message);
    }
  }

  /**
   * Validate a phone number with all available providers
   */
  static async validateWithAll(phoneNumber: string): Promise<PhoneValidationResult[]> {
    const results: PhoneValidationResult[] = [];
    
    for (const provider of this.PROVIDERS) {
      const result = await this.validateWithProvider(phoneNumber, provider);
      results.push(result);
    }

    return results;
  }

  /**
   * Local fallback validation (regex based)
   */
  private static localFallback(phoneNumber: string, providerName: string, errorMsg: string): PhoneValidationResult {
    const digits = phoneNumber.replace(/[^\d]/g, '');
    const isValid = digits.length >= 10; // Basic check

    return {
      provider: `${providerName}_fallback`,
      valid: isValid,
      number: phoneNumber,
      raw: { 
        note: 'Validated using local fallback due to API error',
        original_error: errorMsg,
        timestamp: new Date().toISOString()
      }
    };
  }
}
