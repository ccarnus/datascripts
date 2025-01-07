import os
import requests
import json
import re
import tkinter as tk
from tkinter import filedialog

################################################################################
# HELPER / UTILITY FUNCTIONS
################################################################################

def format_displayed_name(name):
    """
    Insert a space before each uppercase letter (except the first),
    and also before 'of' and 'and'.
    Example: 'UniversityofMelbourne' -> 'University of Melbourne'
    """
    displayed = re.sub(r'(?<!^)([A-Z])', r' \1', name)
    displayed = re.sub(r'(?<!\s)(of)', r' \1', displayed, flags=re.IGNORECASE)
    displayed = re.sub(r'(?<!\s)(and)', r' \1', displayed, flags=re.IGNORECASE)

    displayed = re.sub(r'\bOf\b', 'of', displayed)
    displayed = re.sub(r'\bAnd\b', 'and', displayed)

    return displayed.strip()

################################################################################
# CAST VALIDATION
################################################################################

REQUIRED_FIELDS_CAST = [
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
    Checks whether the cast payload has exactly the required fields
    (REQUIRED_FIELDS_CAST), none are empty, and no extras.
    """
    payload_keys = set(payload.keys())
    required_keys = set(REQUIRED_FIELDS_CAST)

    # Check for extra / missing fields
    extra_keys = payload_keys - required_keys
    if extra_keys:
        return False, f"Extra field(s): {list(extra_keys)}"

    missing_keys = required_keys - payload_keys
    if missing_keys:
        return False, f"Missing field(s): {list(missing_keys)}"

    # Ensure no field is empty
    for key in REQUIRED_FIELDS_CAST:
        val = payload[key]
        # All cast fields are expected to be non-empty strings.
        if not isinstance(val, str) or not val.strip():
            return False, f"Field '{key}' is empty or not a string."

    return True, None

################################################################################
# ARTICLE VALIDATION
################################################################################

# We add "duration" to the required fields, but note that it's an integer field.
REQUIRED_FIELDS_ARTICLE = [
    "title",
    "department",
    "articleDescription",
    "university",
    "category",
    "visibility",
    "link",
    "topic",
    "dateadded",
    "duration"
]

def validate_article_payload(payload):
    """
    Checks whether the article payload has exactly the required fields
    (REQUIRED_FIELDS_ARTICLE), with the following conditions:
      - No extra or missing fields
      - None of the string fields is empty
      - 'duration' is an integer
    """
    payload_keys = set(payload.keys())
    required_keys = set(REQUIRED_FIELDS_ARTICLE)

    extra_keys = payload_keys - required_keys
    if extra_keys:
        return False, f"Extra field(s): {list(extra_keys)}"

    missing_keys = required_keys - payload_keys
    if missing_keys:
        return False, f"Missing field(s): {list(missing_keys)}"

    # Validate each field
    for key in REQUIRED_FIELDS_ARTICLE:
        val = payload[key]
        if key == "duration":
            # Must be an integer
            if not isinstance(val, int):
                return False, "Field 'duration' must be an integer."
            if val <= 0:
                return False, "Field 'duration' must be > 0."
        else:
            # All other fields: non-empty string
            if not isinstance(val, str) or not val.strip():
                return False, f"Field '{key}' is empty or not a string."

    return True, None

################################################################################
# UNIVERSITIES
################################################################################

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

################################################################################
# CASTS
################################################################################

def create_casts():
    print("\n" + "="*50)
    print("           CAST CREATION UTILITY".center(50))
    print("="*50 + "\n")

    brightmindid = input("Enter the brightmindid value to be added to each cast: ").strip()
    if not brightmindid:
        print("No brightmindid provided, defaulting to an empty string.")
        brightmindid = ""

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

    subfolders = [f for f in os.listdir(folder_path) if os.path.isdir(os.path.join(folder_path, f))]
    if not subfolders:
        print("No subfolders found.")
        return

    print(f"\nFound {len(subfolders)} subfolders to create casts from:")

    validation_results = {}  # subfolder -> (is_valid, error_msg)

    # Validate all subfolders
    for sf in subfolders:
        sf_path = os.path.join(folder_path, sf)
        if not os.path.isdir(sf_path):
            validation_results[sf] = (False, "Not a directory?")
            continue

        files_in_sf = os.listdir(sf_path)

        # Exactly one 'json.txt'
        json_candidates = [f for f in files_in_sf if f.lower() == 'json.txt']
        if len(json_candidates) != 1:
            validation_results[sf] = (False, "No suitable single 'json.txt' found.")
            continue

        # Exactly one other file for video
        video_candidates = [f for f in files_in_sf if f.lower() != 'json.txt']
        if len(video_candidates) != 1:
            validation_results[sf] = (False, "No suitable single video file found.")
            continue

        json_file = json_candidates[0]
        json_path = os.path.join(sf_path, json_file)
        if not os.path.isfile(json_path):
            validation_results[sf] = (False, "'json.txt' file missing.")
            continue

        try:
            with open(json_path, 'r') as jf:
                content = jf.read().strip()
                cast_data = json.loads(content)
        except json.JSONDecodeError:
            validation_results[sf] = (False, "Invalid JSON format.")
            continue

        # Validate
        is_valid, err_msg = validate_cast_payload(cast_data)
        if not is_valid:
            validation_results[sf] = (False, f"Payload error: {err_msg}")
            continue

        validation_results[sf] = (True, None)

    # Display subfolders and any errors
    for sf in subfolders:
        is_valid, err_msg = validation_results.get(sf, (False, "Unknown error"))
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

    # Create the casts
    for sf in subfolders:
        sf_path = os.path.join(folder_path, sf)
        is_valid, err_msg = validation_results[sf]
        if not is_valid:
            print(f"Skipping '{sf}' due to payload error: {err_msg}")
            fail_count += 1
            failed_folders.append(sf)
            continue

        files_in_sf = os.listdir(sf_path)
        json_file = 'json.txt'
        video_candidates = [f for f in files_in_sf if f.lower() != 'json.txt']
        video_file = video_candidates[0]

        json_path = os.path.join(sf_path, json_file)
        video_path = os.path.join(sf_path, video_file)

        with open(json_path, 'r') as jf:
            cast_data = json.loads(jf.read().strip())

        cast_data["brightmindid"] = brightmindid

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

    print("\nCAST CREATION SUMMARY:")
    print(f"  Success: {success_count}")
    print(f"  Failed: {fail_count}")
    if failed_folders:
        print("  Failed folders:")
        for ff in failed_folders:
            print(f"    - {ff}")

    input("\nPress Enter to exit...")

################################################################################
# ARTICLES
################################################################################

def create_articles():
    """
    Creates articles from a folder of text/json files at the top level.
    - Prompts user for brightmindid (added to each article).
    - Validates each file's JSON structure:
       * Must contain all required fields, including integer 'duration'
       * No extra fields
       * All string fields are non-empty
       * duration is integer > 0
    - Summarizes errors.
    - If user proceeds, POSTs each valid article to the endpoint.
    """
    print("\n" + "="*50)
    print("          ARTICLE CREATION UTILITY".center(50))
    print("="*50 + "\n")

    brightmindid = input("Enter the brightmindid value to be added to each article: ").strip()
    if not brightmindid:
        print("No brightmindid provided, defaulting to empty string.")
        brightmindid = ""

    # Choose folder
    root = tk.Tk()
    root.withdraw()
    folder_path = filedialog.askdirectory(title="Select Folder Containing Article JSON Files")
    root.destroy()

    if not folder_path:
        print("No folder selected. Exiting.")
        return
    if not os.path.isdir(folder_path):
        print("Invalid folder path. Exiting.")
        return

    # We accept .txt or .json as candidate files
    valid_extensions = ('.txt', '.json')
    all_files = os.listdir(folder_path)
    article_candidates = [f for f in all_files if f.lower().endswith(valid_extensions)]

    if not article_candidates:
        print("No .txt or .json files found in the selected folder.")
        return

    print(f"\nFound {len(article_candidates)} file(s) to create articles from:")

    # Validate each file
    validation_results = {}
    for filename in article_candidates:
        file_path = os.path.join(folder_path, filename)
        if not os.path.isfile(file_path):
            validation_results[filename] = (False, "Not a file?")
            continue

        try:
            with open(file_path, 'r', encoding='utf-8') as jf:
                content = jf.read().strip()
                article_data = json.loads(content)
        except json.JSONDecodeError:
            validation_results[filename] = (False, "Invalid JSON format.")
            continue
        except Exception as e:
            validation_results[filename] = (False, f"Error reading file: {str(e)}")
            continue

        # Validate fields
        is_valid, err_msg = validate_article_payload(article_data)
        if not is_valid:
            validation_results[filename] = (False, err_msg)
        else:
            validation_results[filename] = (True, None)

    # Display
    for filename in article_candidates:
        is_valid, err_msg = validation_results[filename]
        if is_valid:
            print(f"  - {filename}")
        else:
            print(f"  - {filename}  (PAYLOAD ERROR: {err_msg})")

    proceed = input("\nDo you want to proceed with creation of these articles? (yes/no): ").strip().lower()
    if proceed != "yes":
        print("\nAborting article creation process.")
        return

    url = "http://3.17.219.54/article"

    success_count = 0
    fail_count = 0
    failed_files = []

    for filename in article_candidates:
        is_valid, err_msg = validation_results[filename]
        if not is_valid:
            print(f"Skipping '{filename}' due to payload error: {err_msg}")
            fail_count += 1
            failed_files.append(filename)
            continue

        file_path = os.path.join(folder_path, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as jf:
                article_data = json.loads(jf.read().strip())
        except Exception as e:
            print(f"Skipping '{filename}' due to error reading file: {e}")
            fail_count += 1
            failed_files.append(filename)
            continue

        # Insert brightmindid
        article_data["brightmindid"] = brightmindid

        # Debug: Print the payload before sending
        print(f"\nDEBUG - Payload for '{filename}':")
        print(json.dumps(article_data, indent=2))

        response = requests.post(url, json=article_data)


        if response.status_code == 201:
            print(f"Successfully created article from file '{filename}'.")
            success_count += 1
        else:
            # Capture response.text for additional error details
            error_detail = response.text
            print(f"Failed to create article from file '{filename}'. "
                  f"Status code: {response.status_code}. "
                  f"Error detail: {error_detail}")
            fail_count += 1
            failed_files.append(filename)

    print("\nARTICLE CREATION SUMMARY:")
    print(f"  Success: {success_count}")
    print(f"  Failed: {fail_count}")
    if failed_files:
        print("  Failed files:")
        for ff in failed_files:
            print(f"    - {ff}")

    input("\nPress Enter to exit...")

################################################################################
# MAIN MENU
################################################################################

def main_menu():
    while True:
        print("\n" + "="*50)
        print("           CREATION MAIN MENU".center(50))
        print("="*50 + "\n")
        print("Please select what you would like to create:\n")
        print("  1) Universities")
        print("  2) Cast")
        print("  3) Articles")
        print("  Q) Quit")

        choice = input("\nEnter your choice: ").strip().lower()

        if choice == "1":
            create_universities()
        elif choice == "2":
            create_casts()
        elif choice == "3":
            create_articles()
        elif choice == "q":
            print("\nExiting...")
            break
        else:
            print("\nInvalid choice. Please try again.\n")

if __name__ == "__main__":
    main_menu()
