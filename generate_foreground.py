from PIL import Image, ImageDraw

def generate_foreground():
    # Load the source image to extract the white note
    source_path = 'final_icon_fixed.png'
    try:
        img = Image.open(source_path).convert("RGBA")
    except FileNotFoundError:
        print(f"Error: {source_path} not found.")
        return

    # Extract white pixels (the note)
    # We'll consider pixels with high R, G, B values as "white"
    data = img.getdata()
    new_data = []
    for item in data:
        # If it's very bright (white), keep it white with full alpha
        # Otherwise, make it fully transparent
        if item[0] > 200 and item[1] > 200 and item[2] > 200:
            new_data.append((255, 255, 255, 255))
        else:
            new_data.append((255, 255, 255, 0))
    
    note_img = Image.new("RGBA", img.size)
    note_img.putdata(new_data)

    # Crop to the content (the note)
    bbox = note_img.getbbox()
    if not bbox:
        print("Error: Could not find any white pixels in the source image.")
        return
    note_img = note_img.crop(bbox)

    # Create 1024x1024 transparent canvas
    canvas_size = 1024
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))

    # Calculate scaling to fit in safe zone (standard is 66% of total size)
    # 1024 * 0.66 = ~675
    target_size = 675
    
    w, h = note_img.size
    ratio = min(target_size / w, target_size / h)
    new_w = int(w * ratio)
    new_h = int(h * ratio)
    
    note_resized = note_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Paste in center
    offset = ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2)
    canvas.paste(note_resized, offset, note_resized)

    # Save to drawable
    output_path = 'android/app/src/main/res/drawable/ic_launcher_foreground.png'
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    canvas.save(output_path)
    print(f"Successfully generated {output_path}")

if __name__ == "__main__":
    generate_foreground()
