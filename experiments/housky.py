import json
import urllib.request
import urllib.parse
import ssl

# --- CONFIGURATION ---
API_KEY = "0e7cd394-6791-4326-b1d9-ea96782a3f74"
# --- CONFIGURATION ---
API_KEY = "0e7cd394-6791-4326-b1d9-ea96782a3f74"
# Using fuzzy match string from user input
SEARCH_QUERY = "RTE 475 DUNE BOUCTOUCHE" 
# ---------------------

# Build the URL and Parameters
base_uri = "https://api.houski.ca/properties"

# --- CONFIGURATION ---
API_KEY = "0e7cd394-6791-4326-b1d9-ea96782a3f74"
SEARCH_QUERY = "RTE 475 DUNE BOUCTOUCHE" 
# ---------------------

# Build the URL and Parameters
base_uri = "https://api.houski.ca/properties"

print(f"--- Testing individual ownership fields ---")

# Try each potential ownership field
test_fields = ["owner_name", "registered_owner_name", "title_owner", "owner", "property_owner"]

for field in test_fields:
    print(f"\nTesting field: {field}...")
    params = {
        "api_key": API_KEY,
        "select": f"address,{field}",
        "limit": "1"
    }
# Note: address_match parameter might be restricted or require specific tier. address_eq requires exact match.
# Let's verify we can get ANY data first.
# (Rest of script logic needs to handle this re-assignment or I should rewrite the whole thing to structure it better)
# I will just rewrite the bottom part or make it a function.


    # Make the Request
    try:
        # Encode parameters
        query_string = urllib.parse.urlencode(params)
        url = f"{base_uri}?{query_string}"

        # Create valid context
        context = ssl.create_default_context()

        with urllib.request.urlopen(url, context=context) as response:
            if response.status != 200:
                print(f"  Error: Status Code {response.status}")
            else:
                data = json.load(response)
                properties = data.get('data', [])

                # Check if we got data and if the field exists
                if properties and len(properties) > 0:
                    if field in properties[0]:
                        print(f"  [FOUND] {field} = {properties[0][field]}")
                    else:
                        print(f"  Field requested but not in response")
                else:
                    print(f"  No data returned")

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        error_data = json.loads(error_body)
        print(f"  [INVALID] {error_data.get('error', e.reason)}")
    except Exception as e:
        print(f"  \033[91mError: {e}\033[0m")