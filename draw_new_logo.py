from PIL import Image, ImageDraw

def draw_app_main_logo():
    # 创建 1024x1024 的完全透明画布 (RGBA)
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 中心点
    cx, cy = size // 2, size // 2
    
    # 比例调整：占画幅 60% 左右
    
    # 音符头：加粗椭圆
    head_w, head_h = 240, 180
    head_x = cx - 180
    head_y = cy + 120
    draw.ellipse([head_x, head_y, head_x + head_w, head_y + head_h], fill=(255, 255, 255, 255))
    
    # 音符杆：加粗竖线
    stem_w = 60
    stem_h = 500
    stem_x = head_x + head_w - stem_w
    stem_y = head_y - stem_h + 50
    draw.rectangle([stem_x, stem_y, stem_x + stem_w, head_y + 50], fill=(255, 255, 255, 255))
    
    # 音符尾 (旗帜)：加粗多边形
    draw.polygon([
        (stem_x + stem_w, stem_y),
        (stem_x + stem_w + 220, stem_y + 100),
        (stem_x + stem_w + 220, stem_y + 250),
        (stem_x + stem_w, stem_y + 150)
    ], fill=(255, 255, 255, 255))

    # 保存为新名字，避开缓存
    output_path = 'android/app/src/main/res/drawable/app_main_logo.png'
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path)
    print(f"Successfully generated new logo at {output_path}")

if __name__ == "__main__":
    draw_app_main_logo()
