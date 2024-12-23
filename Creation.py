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
    for sf in subfolders:
        print(f"  - {sf}")

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
        if not os.path.isdir(sf_path):
            # Just in case, skip
            continue

        # We expect one video file and one "json.txt" file
        files_in_sf = os.listdir(sf_path)
        print(f"Working on {sf}... ")

        # Find json.txt file
        json_candidates = [f for f in files_in_sf if f.lower() == 'json.txt']
        if len(json_candidates) != 1:
            print(f"No suitable single 'json.txt' file found in subfolder '{sf}'. Skipping...")
            fail_count += 1
            failed_folders.append(sf)
            continue

        json_file = json_candidates[0]

        # Find a video file (assume exactly one other file that isn't json.txt)
        video_candidates = [f for f in files_in_sf if f.lower() != 'json.txt']
        if len(video_candidates) != 1:
            print(f"No suitable single video file found in subfolder '{sf}'. Skipping...")
            fail_count += 1
            failed_folders.append(sf)
            continue

        video_file = video_candidates[0]

        # Validate files
        json_path = os.path.join(sf_path, json_file) if json_file else None
        video_path = os.path.join(sf_path, video_file) if video_file else None

        if not json_path or not os.path.isfile(json_path):
            print(f"'json.txt' file missing in '{sf}'. Skipping...")
            fail_count += 1
            failed_folders.append(sf)
            continue

        if not video_path or not os.path.isfile(video_path):
            print(f"Video file missing in '{sf}'. Skipping...")
            fail_count += 1
            failed_folders.append(sf)
            continue

        # Read json from json.txt
        with open(json_path, 'r') as jf:
            try:
                content = jf.read().strip()
                cast_data = json.loads(content)
            except json.JSONDecodeError:
                print(f"Invalid JSON in '{sf}'. Skipping...")
                fail_count += 1
                failed_folders.append(sf)
                continue

        # Add brightmindid field
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

if __name__ == "__main__":
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
