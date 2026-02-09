import json
import urllib.request
import urllib.parse
import ssl

# Configuration
API_KEY = "0e7cd394-6791-4326-b1d9-ea96782a3f74"
base_uri = "https://api.houski.ca/properties"

print("--- Testing ownership_type field ---\n")

# Test ownership_type
params = {
    "api_key": API_KEY,
    "select": "address,ownership_type",
    "limit": "5"
}

try:
    query_string = urllib.parse.urlencode(params)
    url = f"{base_uri}?{query_string}"
    context = ssl.create_default_context()

    print(f"Requesting: {url}\n")

    with urllib.request.urlopen(url, context=context) as response:
        if response.status == 200:
            data = json.load(response)
            properties = data.get('data', [])

            if properties:
                print(f"SUCCESS: Found {len(properties)} properties with ownership_type:\n")
                for prop in properties:
                    address = prop.get('address', 'Unknown')
                    ownership_type = prop.get('ownership_type', 'N/A')
                    print(f"  Address: {address}")
                    print(f"  Ownership Type: {ownership_type}\n")

                # Save results
                with open("ownership_test_results.json", 'w') as f:
                    json.dump(properties, f, indent=4)
                print("Full results saved to: ownership_test_results.json")
            else:
                print("No properties returned")

except urllib.error.HTTPError as e:
    error_body = e.read().decode('utf-8')
    print(f"HTTP Error {e.code}: {error_body}")
except Exception as e:
    print(f"Error: {e}")
