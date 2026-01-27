import os
import subprocess
import shutil

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.join(PROJECT_ROOT, "SoundTherapyApp")
ASSETS_DIR = os.path.join(APP_ROOT, "android", "app", "src", "main", "assets")
RES_RAW_DIR = os.path.join(APP_ROOT, "android", "app", "src", "main", "res", "raw")
BACKUP_DIR = os.path.join(PROJECT_ROOT, "audio_engine", "backups")

# Extensions to process
TARGET_EXTS = {".wav", ".flac", ".aiff"}

def get_audio_files(directory):
    audio_files = []
    if not os.path.exists(directory):
        print(f"Directory not found: {directory}")
        return audio_files
    
    for root, _, files in os.walk(directory):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in TARGET_EXTS:
                audio_files.append(os.path.join(root, file))
    return audio_files

def transcode_file(input_path):
    directory = os.path.dirname(input_path)
    filename = os.path.basename(input_path)
    name, ext = os.path.splitext(filename)
    output_filename = f"{name}.m4a"
    output_path = os.path.join(directory, output_filename)
    
    print(f"Transcoding: {filename} -> {output_filename}")
    
    try:
        # ffmpeg -y -i input -c:a aac -b:a 128k -ar 44100 output
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"Error transcoding {filename}: {result.stderr}")
            return None
            
        return output_filename
    except Exception as e:
        print(f"Exception transcoding {filename}: {e}")
        return None

def update_references(old_name, new_name):
    print(f"Updating references: {old_name} -> {new_name}")
    # Walk through SoundTherapyApp looking for .js and .tsx
    # Exclude node_modules, android, ios, .git
    
    exclude_dirs = {"node_modules", "android", "ios", ".git", "build", "pods", "Pods"}
    
    for root, dirs, files in os.walk(APP_ROOT):
        # Modify dirs in-place to skip excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            if file.lower().endswith((".js", ".tsx", ".ts", ".jsx")):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    if old_name in content:
                        print(f"  Found in {file_path}")
                        new_content = content.replace(old_name, new_name)
                        with open(file_path, "w", encoding="utf-8") as f:
                            f.write(new_content)
                except Exception as e:
                    print(f"  Error reading/writing {file_path}: {e}")

def cleanup_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".aiff":
        # Move to backup
        if not os.path.exists(BACKUP_DIR):
            os.makedirs(BACKUP_DIR)
        shutil.move(file_path, os.path.join(BACKUP_DIR, os.path.basename(file_path)))
        print(f"Moved to backup: {os.path.basename(file_path)}")
    else:
        # Delete wav/flac
        os.remove(file_path)
        print(f"Deleted original: {os.path.basename(file_path)}")

def main():
    print("Starting audio optimization...")
    
    # Verify ffmpeg
    if shutil.which("ffmpeg") is None:
        print("Error: ffmpeg is not installed. Please install it (e.g., 'brew install ffmpeg')")
        return

    # Scan directories
    files_to_process = []
    files_to_process.extend(get_audio_files(ASSETS_DIR))
    files_to_process.extend(get_audio_files(RES_RAW_DIR))
    
    print(f"Found {len(files_to_process)} audio files to process.")
    
    for file_path in files_to_process:
        old_filename = os.path.basename(file_path)
        new_filename = transcode_file(file_path)
        
        if new_filename:
            # Update references first
            update_references(old_filename, new_filename)
            
            # Then cleanup
            cleanup_file(file_path)
            
    print("Audio optimization completed!")

if __name__ == "__main__":
    main()
