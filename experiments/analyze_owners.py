"""Analyze owner names in the alberta_reportall_results.json file"""
import json

with open('experiments/alberta_reportall_results.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

results = data.get('results', [])
total_rows = len(results)

# Count different categories
owners_with_data = []
owners_na = []
owners_null = []
owners_empty = []

for result in results:
    if result.get('success') and result.get('data'):
        owner = result['data'].get('owner')

        if owner is None:
            owners_null.append(result)
        elif owner == 'N/A':
            owners_na.append(result)
        elif owner == '':
            owners_empty.append(result)
        else:
            owners_with_data.append({
                'row': result.get('row'),
                'owner': owner,
                'parcel_id': result['data'].get('parcel_id'),
                'address': result['data'].get('address')
            })

print("="*70)
print("OWNER NAMES ANALYSIS")
print("="*70)
print(f"Total rows processed: {total_rows}")
print(f"Successful API calls: {sum(1 for r in results if r.get('success'))}")
print()
print(f"Owner names WITH data: {len(owners_with_data)}")
print(f"Owner = 'N/A': {len(owners_na)}")
print(f"Owner = null: {len(owners_null)}")
print(f"Owner = empty string: {len(owners_empty)}")
print()
print(f"TOTAL with actual owner names: {len(owners_with_data)}")
print(f"TOTAL without owner names: {len(owners_na) + len(owners_null) + len(owners_empty)}")
print()

if owners_with_data:
    print("="*70)
    print(f"SAMPLE OF OWNER NAMES (showing first 20):")
    print("="*70)
    for i, item in enumerate(owners_with_data[:20], 1):
        print(f"{i}. Row {item['row']}: {item['owner']}")
        print(f"   Parcel: {item['parcel_id']}, Address: {item['address']}")
        print()

    # Count unique owner names
    unique_owners = set(item['owner'] for item in owners_with_data)
    print(f"Unique owner names: {len(unique_owners)}")
    print()
    print("Top 10 most common owners:")
    from collections import Counter
    owner_counts = Counter(item['owner'] for item in owners_with_data)
    for owner, count in owner_counts.most_common(10):
        print(f"  {count}x - {owner}")
