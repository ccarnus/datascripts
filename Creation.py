import os
import requests
import json
import re
import tkinter as tk
from tkinter import filedialog

def format_displayed_name(name):
    # Insert space before each uppercase letter (except the first), and also before "of" and "and".
    displayed = re.sub(r'(?<!^)([A-Z])', r' \1', name)
    displayed = re.sub(r'(?<!\s)(of)', r' \1', displayed, flags=re.IGNORECASE)
    displayed = re.sub(r'(?<!\s)(and)', r' \1', displayed, flags=re.IGNORECASE)

    # Ensure "of" and "and" are lowercase
    displayed = re.sub(r'\bOf\b', 'of', displayed)
    displayed = re.sub(r'\bAnd\b', 'and', displayed)

    return displayed.strip()

REQUIRED_FIELDS = [
    "title",
    "department",
    "university",
    "category",
    "visibility",
    "link",
    "topic",
    "dateadded"
]

def validate_cast_payload(payload):
    """
    Checks whether the payload (dict) meets the following criteria:
      - Contains exactly the fields listed in REQUIRED_FIELDS
      - None of these fields is empty (string check)
      - No additional fields are present
    Returns: (is_valid: bool, error_message: str or None)
    """

    # Check for exact set of keys
    payload_keys = set(payload.keys())
    required_keys = set(REQUIRED_FIELDS)

    # Additional fields?
    extra_keys = payload_keys - required_keys
    if extra_keys:
        return False, f"Extra field(s): {list(extra_keys)}"

    # Missing fields?
    missing_keys = required_keys - payload_keys
    if missing_keys:
        return False, f"Missing field(s): {list(missing_keys)}"

    # Now ensure none of the required fields is empty
    for key in REQUIRED_FIELDS:
        val = payload[key]
        # Check emptiness. If it's not a string, we just check if it's "falsy".
        # If you specifically only allow non-empty strings, adjust as needed.
        # For now let's assume all are expected to be strings that are not empty.
        if not isinstance(val, str) or not val.strip():
            return False, f"Field '{key}' is empty or not a string."

    return True, None


def create_universities():
    print("\n" + "="*50)
    print("          UNIVERSITY CREATION UTILITY".center(50))
    print("="*50 + "\n")

    # Open a file navigator to choose the folder
    root = tk.Tk()
    root.withdraw()
    folder_path = filedialog.askdirectory(title="Select Folder Containing University Icons")
    root.destroy()

    if not folder_path:
        print("No folder selected. Exiting.")
        return

    if not os.path.isdir(folder_path):
        print("Invalid folder path. Exiting.")
        return

    files = os.listdir(folder_path)
    image_extensions = ('.png', '.jpg', '.jpeg')
    image_files = [f for f in files if f.lower().endswith(image_extensions)]

    if not image_files:
        print("No image files found in the selected folder.")
        return

    print(f"\nFound {len(image_files)} image files to create universities from:")
    for img_file in image_files:
        print(f"  - {img_file}")

    proceed = input("\nDo you want to proceed with creation of these universities? (yes/no): ").strip().lower()
    if proceed != "yes":
        print("\nAborting creation process.")
        return

    url = "http://3.17.219.54/university"

    for img_file in image_files:
        base_name = os.path.splitext(img_file)[0]
        displayed_name = format_displayed_name(base_name)

        uni_data = {
            "name": base_name,
            "displayedName": displayed_name
        }

        icon_path = os.path.join(folder_path, img_file)
        if not os.path.isfile(icon_path):
            print(f"File not found: {icon_path}, skipping...")
            continue

        files_data = {
            'icon': (img_file, open(icon_path, 'rb'), 'image/png'),
            'university': (None, json.dumps(uni_data), 'application/json')
        }

        response = requests.post(url, files=files_data)

        if response.status_code == 201:
            print(f"Successfully created university: {displayed_name}")
        else:
            print(f"Failed to create university from {img_file}. Status code: {response.status_code}. Skipping...")

    print("\nCreation process completed.\n")


def create_casts():
    print("\n" + "="*50)
    print("           CAST CREATION UTILITY".center(50))
    print("="*50 + "\n")

    # Prompt for brightmindid value
    brightmindid = input("Enter the brightmindid value to be added to each cast: ").strip()
    if not brightmindid:
        print("No brightmindid provided, defaulting to an empty string.")
        brightmindid = ""

    # Open a file navigator to choose the folder
    root = tk.Tk()
    root.withdraw()
    folder_path = filedialog.askdirectory(title="Select Folder Containing Cast Subfolders")
    root.destroy()

    if not folder_path:
        print("No folder selected. Exiting.")
        return

    if not os.path.isdir(folder_path):
        print("Invalid folder path. Exiting.")
        return

    # List subfolders
    subfolders = [f for f in os.listdir(folder_path) if os.path.isdir(os.path.join(folder_path, f))]
    if not subfolders:
        print("No subfolders found.")
        return

    print(f"\nFound {len(subfolders)} subfolders to create casts from:")

    # We'll validate all subfolders first:
    validation_results = {}  # {subfolder_name: (is_valid, error_msg)}

    for sf in subfolders:
        sf_path = os.path.join(folder_path, sf)
        if not os.path.isdir(sf_path):
            # Just in case
            validation_results[sf] = (False, "Not a directory?")
            continue

        files_in_sf = os.listdir(sf_path)

        # Check presence of exactly one 'json.txt'
        json_candidates = [f for f in files_in_sf if f.lower() == 'json.txt']
        if len(json_candidates) != 1:
            validation_results[sf] = (False, "No suitable single 'json.txt' found.")
            continue

        # Check presence of exactly one other file as video
        video_candidates = [f for f in files_in_sf if f.lower() != 'json.txt']
        if len(video_candidates) != 1:
            validation_results[sf] = (False, "No suitable single video file found.")
            continue

        # Validate the JSON
        json_file = json_candidates[0]
        json_path = os.path.join(sf_path, json_file)
        if not os.path.isfile(json_path):
            validation_results[sf] = (False, "'json.txt' file missing.")
            continue

        with open(json_path, 'r') as jf:
            try:
                content = jf.read().strip()
                cast_data = json.loads(content)
            except json.JSONDecodeError:
                validation_results[sf] = (False, "Invalid JSON format.")
                continue

        # Check that all required fields exist, no extra fields, none empty
        is_valid, err_msg = validate_cast_payload(cast_data)
        if not is_valid:
            validation_results[sf] = (False, f"Payload error: {err_msg}")
            continue

        # If all is well, subfolder is valid
        validation_results[sf] = (True, None)

    # Now display the subfolders, marking those with errors
    for sf in subfolders:
        is_valid, err_msg = validation_results[sf]
        if is_valid:
            print(f"  - {sf}")
        else:
            print(f"  - {sf}  (PAYLOAD ERROR: {err_msg})")

    proceed = input("\nDo you want to proceed with creation of these casts? (yes/no): ").strip().lower()
    if proceed != "yes":
        print("\nAborting creation process.")
        return

    url = "http://3.17.219.54/cast"

    success_count = 0
    fail_count = 0
    failed_folders = []

    for sf in subfolders:
        sf_path = os.path.join(folder_path, sf)
        is_valid, err_msg = validation_results[sf]

        if not is_valid:
            # Skip automatically
            print(f"Skipping '{sf}' due to payload error: {err_msg}")
            fail_count += 1
            failed_folders.append(sf)
            continue

        # We already know there's 1 JSON and 1 video
        files_in_sf = os.listdir(sf_path)
        json_file = 'json.txt'
        video_candidates = [f for f in files_in_sf if f.lower() != 'json.txt']
        video_file = video_candidates[0]

        json_path = os.path.join(sf_path, json_file)
        video_path = os.path.join(sf_path, video_file)

        # Re-read the JSON (already validated, but we need to embed the brightmindid)
        with open(json_path, 'r') as jf:
            content = jf.read().strip()
            cast_data = json.loads(content)

        # Insert brightmindid
        cast_data["brightmindid"] = brightmindid

        # Prepare POST
        files_data = {
            'video': (video_file, open(video_path, 'rb'), 'video/mp4'),
            'cast': (None, json.dumps(cast_data), 'application/json')
        }

        response = requests.post(url, files=files_data)

        if response.status_code == 201:
            print(f"Successfully created cast from folder '{sf}'.")
            success_count += 1
        else:
            print(f"Failed to create cast from folder '{sf}'. Status code: {response.status_code}.")
            fail_count += 1
            failed_folders.append(sf)

    # Summary
    print("\nCAST CREATION SUMMARY:")
    print(f"  Success: {success_count}")
    print(f"  Failed: {fail_count}")
    if failed_folders:
        print("  Failed folders:")
        for ff in failed_folders:
            print(f"    - {ff}")

    input("\nPress Enter to exit...")

def main_menu():
    while True:
        print("\n" + "="*50)
        print("           CREATION MAIN MENU".center(50))
        print("="*50 + "\n")
        print("Please select what you would like to create:\n")
        print("  1) Universities")
        print("  2) Cast")
        print("  Q) Quit")

        choice = input("\nEnter your choice: ").strip().lower()

        if choice == "1":
            create_universities()
        elif choice == "2":
            create_casts()
        elif choice == "q":
            print("\nExiting...")
            break
        else:
            print("\nInvalid choice. Please try again.\n")

if __name__ == "__main__":
    main_menu()
