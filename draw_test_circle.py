from PIL import Image, ImageDraw

def draw_final_bold_note():
    # 创建 1024x1024 的完全透明画布 (RGBA)
    size = 1024
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # 中心参考点
    cx, cy = size // 2, size // 2
    
    # 颜色：纯白色
    white = (255, 255, 255, 255)

    # 1. 画音符头 (左下角的椭圆)
    # 稍微倾斜，位置略微调整以确保整体居中
    head_w, head_h = 280, 220
    head_x = cx - 240
    head_y = cy + 120
    draw.ellipse([head_x, head_y, head_x + head_w, head_y + head_h], fill=white)

    # 2. 画音符杆 (加粗竖线)
    stem_w = 80
    stem_h = 580
    stem_x = head_x + head_w - stem_w
    stem_y = head_y - stem_h + 80
    draw.rectangle([stem_x, stem_y, stem_x + stem_w, head_y + 80], fill=white)

    # 3. 画音符尾 (右上角的旗帜)
    # 采用更有动感的弧度感几何形状
    flag_x = stem_x + stem_w
    flag_y = stem_y
    draw.polygon([
        (flag_x, flag_y),
        (flag_x + 320, flag_y + 140),
        (flag_x + 320, flag_y + 340),
        (flag_x, flag_y + 200)
    ], fill=white)

    # 最终保存为 app_main_logo.png
    output_path = 'android/app/src/main/res/drawable/app_main_logo.png'
    canvas.save(output_path)
    print(f"Successfully generated final beautiful bold note at {output_path}")

if __name__ == "__main__":
    draw_final_bold_note()
