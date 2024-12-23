import requests

def purge_items(item_type):
    if item_type == "cast":
        base_url = "http://3.17.219.54/cast"
        item_name = "casts"
        id_field = "_id"
        display_field = "_id"
    elif item_type == "article":
        base_url = "http://3.17.219.54/article"
        item_name = "articles"
        id_field = "_id"
        display_field = "_id"
    elif item_type == "user":
        base_url = "http://3.17.219.54/user"
        item_name = "users"
        id_field = "_id"
        display_field = "username"
    elif item_type == "university":
        base_url = "http://3.17.219.54/university"
        item_name = "universities"
        id_field = "_id"
        display_field = "displayedName"
    else:
        print("Invalid item type.")
        return

    print(f"\nFetching all {item_name}...")
    response = requests.get(base_url)
    if response.status_code != 200:
        print(f"Failed to fetch {item_name}. Status code: {response.status_code}")
        return
    
    items = response.json()
    if not isinstance(items, list):
        print("Unexpected response format: expected a list.")
        return
    
    # Extract IDs and display values
    results = []
    for item in items:
        if id_field in item:
            display_val = item.get(display_field, "(no value)")
            results.append((item[id_field], display_val))

    if not results:
        print(f"No {item_name} found. Nothing to delete.")
        return

    print(f"\n{len(results)} {item_name.capitalize()} found:")
    for iid, dval in results:
        print(f"  - {dval}")

    # Prompt the operator to proceed
    proceed = input(f"\nDo you want to proceed with deletion of all these {len(results)} {item_name}? (yes/no): ").strip().lower()
    if proceed != "yes":
        print("\nAborting deletion process.")
        return

    # Delete all items one by one
    for iid, dval in results:
        delete_url = f"{base_url}/{iid}"
        del_response = requests.delete(delete_url)
        if del_response.status_code == 200:
            print(f"Successfully deleted {item_type}: {dval}")
        else:
            print(f"Failed to delete {item_type} {dval}. Status code: {del_response.status_code}")
        
    print(f"\nDeletion process for {item_name} completed.\n")
    input("Press Enter to exit...")  # Added prompt here


if __name__ == "__main__":
    print("\n" + "="*50)
    print("          PURGE UTILITY".center(50))
    print("="*50 + "\n")
    print("Please select what you would like to purge:\n")
    print("  1) Casts")
    print("  2) Articles")
    print("  3) Users")
    print("  4) Universities")
    choice = input("\nEnter the number of your choice (1, 2, 3 or 4): ").strip()

    if choice == "1":
        purge_items("cast")
    elif choice == "2":
        purge_items("article")
    elif choice == "3":
        purge_items("user")
    elif choice == "4":
        purge_items("university")
    else:
        print("\nInvalid choice. Exiting without action.\n")
        input("Press Enter to exit...")
