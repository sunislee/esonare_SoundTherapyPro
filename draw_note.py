from PIL import Image, ImageDraw

def draw_musical_note():
    # 创建 1024x1024 的纯透明画布
    size = 1024
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # 我们手动画一个简单的音符形状 (Musical Note)
    # 中心位置
    center_x, center_y = size // 2, size // 2
    
    # 比例调整，确保在安全区域内 (约 66% 区域)
    scale = 400 
    
    # 音符头 (椭圆)
    head_w, head_h = 160, 120
    head_x = center_x - 80
    head_y = center_y + 100
    draw.ellipse([head_x, head_y, head_x + head_w, head_y + head_h], fill=(255, 255, 255, 255))
    
    # 音符杆 (竖线)
    stem_w = 30
    stem_h = 350
    stem_x = head_x + head_w - stem_w
    stem_y = head_y - stem_h + 30
    draw.rectangle([stem_x, stem_y, stem_x + stem_w, head_y + 30], fill=(255, 255, 255, 255))
    
    # 音符尾 (旗帜)
    flag_w = 150
    flag_h = 100
    draw.polygon([
        (stem_x + stem_w, stem_y),
        (stem_x + stem_w + flag_w, stem_y + 50),
        (stem_x + stem_w + flag_w, stem_y + 150),
        (stem_x + stem_w, stem_y + 100)
    ], fill=(255, 255, 255, 255))

    # 保存
    output_path = 'android/app/src/main/res/drawable/ic_launcher_foreground.png'
    img.save(output_path)
    print(f"Successfully drawn and saved {output_path}")

if __name__ == "__main__":
    draw_musical_note()
