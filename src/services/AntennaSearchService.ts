import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * AntennaSearchService
 * Scrapes registration data from antennasearch.com
 */
export class AntennaSearchService {
    private static readonly BASE_URL = 'http://antennasearch.com/HTML/search/search.php';

    /**
     * Stealth headers to minimize bot detection
     */
    private static getStealthHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        };
    }

    /**
     * Fetches antenna records near a given coordinate.
     * @param lat Latitude
     * @param lon Longitude
     * @returns Array of antenna records
     */
    static async fetchAntennas(lat: number, lon: number): Promise<any[]> {
        try {
            // AntennaSearch uses 'address' param which can take lat,lon
            const response = await axios.get(this.BASE_URL, {
                params: {
                    address: `${lat},${lon}`
                },
                headers: this.getStealthHeaders()
            });

            const $ = cheerio.load(response.data);
            const results: any[] = [];

            // Example Parsing Logic (AntennaSearch structure varies, this targets the "Antennas" table)
            // Note: Actual scraping requires finding the specific table ID or classes which may change.
            // Often registration data is found in tables containing "Carrier" or "Registration".
            
            $('table tr').each((i, el) => {
                const cells = $(el).find('td');
                if (cells.length >= 5) {
                    const owner = $(cells[1]).text().trim();
                    const structure = $(cells[3]).text().trim();
                    const address = $(cells[2]).text().trim();
                    const registrationId = $(cells[0]).text().trim();

                    // Filter for AT&T and Rooftop-like structures
                    const isATT = /AT&T|New Cingular|Pacific Bell|Cingular/i.test(owner);
                    const isRooftop = /Building|Rooftop|Steeple|Water Tank|Silo/i.test(structure);

                    if (isATT && isRooftop) {
                        results.push({
                            registrationId,
                            ownerName: owner,
                            address,
                            structureType: structure,
                            lat, // Approximated by search center if precise isn't in table
                            lon,
                            source: 'AntennaSearch',
                            rawData: {
                                fullRow: $(el).text().trim(),
                                structure
                            }
                        });
                    }
                }
            });

            return results;
        } catch (error: any) {
            console.error(`[AntennaSearch] Error fetching for ${lat},${lon}:`, error.message);
            throw error;
        }
    }
}
