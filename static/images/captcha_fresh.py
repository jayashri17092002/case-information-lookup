#!/usr/bin/env python3
"""
Fresh CAPTCHA Generator for Delhi Court Lookup
Generates unique CAPTCHA images for each session
"""

import random
import string
from PIL import Image, ImageDraw, ImageFont
import io
import os

class CaptchaGenerator:
    def __init__(self):
        self.width = 150
        self.height = 50
        self.font_size = 24
        
    def generate_captcha_text(self, length=5):
        """Generate random CAPTCHA text"""
        # Mix of letters and numbers like real court CAPTCHAs
        chars = string.ascii_uppercase + string.digits
        # Remove confusing characters
        chars = chars.replace('0', '').replace('O', '').replace('I', '').replace('1')
        return ''.join(random.choice(chars) for _ in range(length))
    
    def create_captcha_image(self, text):
        """Create CAPTCHA image with given text"""
        # Create image with white background
        image = Image.new('RGB', (self.width, self.height), 'white')
        draw = ImageDraw.Draw(image)
        
        # Add background noise
        for _ in range(100):
            x = random.randint(0, self.width)
            y = random.randint(0, self.height)
            draw.point((x, y), fill='lightgray')
        
        # Add lines for distortion
        for _ in range(5):
            x1 = random.randint(0, self.width)
            y1 = random.randint(0, self.height)
            x2 = random.randint(0, self.width)
            y2 = random.randint(0, self.height)
            draw.line([(x1, y1), (x2, y2)], fill='gray', width=1)
        
        # Draw text
        try:
            # Try to use a system font
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", self.font_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()
        
        # Calculate text position
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (self.width - text_width) // 2
        y = (self.height - text_height) // 2
        
        # Draw text with slight rotation and color variation
        for i, char in enumerate(text):
            char_x = x + i * (text_width // len(text))
            char_y = y + random.randint(-5, 5)
            color = (random.randint(50, 150), random.randint(50, 150), random.randint(50, 150))
            draw.text((char_x, char_y), char, font=font, fill=color)
        
        return image
    
    def save_captcha(self, text, filename):
        """Save CAPTCHA image to file"""
        image = self.create_captcha_image(text)
        image.save(filename, 'PNG')
        return filename

if __name__ == "__main__":
    generator = CaptchaGenerator()
    text = generator.generate_captcha_text()
    filename = f"captcha_{random.randint(1000, 9999)}.png"
    generator.save_captcha(text, filename)
    print(f"Generated CAPTCHA: {text} -> {filename}")