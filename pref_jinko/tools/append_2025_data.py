import re
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import pypdf

# 都道府県リスト（コード順）
pref_names = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
]

def clean_name(name):
    return re.sub(r'\s+', '', name)

def extract_2025_population():
    print("Extracting 2025 population from outline.pdf...")
    reader = pypdf.PdfReader('outline.pdf')
    
    # 9枚目のページ（0-indexed で 8）を取得
    page = reader.pages[8]
    text = page.extract_text()
    lines = text.split('\n')
    
    extracted = {}
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        
        tokens = line_clean.split()
        if not tokens:
            continue
            
        matched_pref = None
        matched_idx = -1
        for p in pref_names:
            combined = ""
            for idx, token in enumerate(tokens):
                combined += token
                if clean_name(combined) == p:
                    matched_pref = p
                    matched_idx = idx
                    break
            if matched_pref:
                break
                
        if matched_pref:
            nums_tokens = tokens[matched_idx+1:]
            large_nums = []
            for t in nums_tokens:
                clean_t = t.replace(',', '')
                if clean_t.replace('-', '').isdigit():
                    val = int(clean_t)
                    if val > 100000: # 人口は10万以上
                        large_nums.append(val)
            
            # 2015, 2020, 2025 の3つの数値がある
            if len(large_nums) >= 3:
                pop_2025 = large_nums[2]
                # 千人単位に変換（四捨五入）
                pop_2025_k = round(pop_2025 / 1000)
                extracted[matched_pref] = float(pop_2025_k)
                
    if len(extracted) != 47:
        raise Exception(f"Failed to extract all 47 prefectures. Found only {len(extracted)}.")
        
    print("Successfully extracted data for 47 prefectures.")
    return extracted

def append_to_csv(csv_path, data_2025):
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path, index_col=0)
    
    # 2025年の行を作成
    new_row = pd.Series(name=2025, dtype=float)
    for p in pref_names:
        new_row[p] = data_2025[p]
        
    # 重複防止のため、すでに2025年の行があれば削除して追加
    if 2025 in df.index:
        df = df.drop(2025)
        
    df.loc[2025] = new_row
    
    # 年でソート
    df = df.sort_index()
    
    # 保存
    df.to_csv(csv_path, encoding='utf-8-sig')
    print(f"Updated {csv_path}")
    return df

def generate_graphs(df_raw, df_interp):
    # 1. 青森県単体グラフの再生成
    print("Re-generating Aomori graph...")
    plt.figure(figsize=(10, 6))
    plt.plot(df_raw.index, df_raw['青森県'], marker='o', color='#1f77b4', linewidth=2, markersize=4)
    plt.title('Population Trend of Aomori Prefecture (1920-2025)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Year', fontsize=12, labelpad=10)
    plt.ylabel('Population (Thousands)', fontsize=12, labelpad=10)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.tight_layout()
    plt.savefig('aomori_population.png', dpi=300)
    
    # 2. 青森県・沖縄県比較グラフの再生成
    print("Re-generating comparison graph...")
    plt.figure(figsize=(12, 7))
    plt.plot(df_interp.index, df_interp['青森県'], label='Aomori Prefecture', marker='o', color='#1f77b4', markersize=3)
    plt.plot(df_interp.index, df_interp['沖縄県'], label='Okinawa Prefecture (Interpolated)', marker='s', color='#ff7f0e', markersize=3)
    plt.axvspan(1945, 1971, color='yellow', alpha=0.15, label='Okinawa Interpolation Period')
    plt.title('Population Trends: Aomori vs Okinawa (1920-2025)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Year', fontsize=12, labelpad=10)
    plt.ylabel('Population (Thousands)', fontsize=12, labelpad=10)
    plt.legend(fontsize=10, loc='upper left')
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.tight_layout()
    plt.savefig('aomori_okinawa_comparison.png', dpi=300)
    print("Graphs updated successfully.")

def verify(df_raw, df_interp):
    print("\n--- Verification ---")
    for name, df in [("Raw CSV", df_raw), ("Interpolated CSV", df_interp)]:
        print(f"=== {name} ===")
        print(f"Shape: {df.shape}")
        if df.shape == (106, 47):
            print("✔ Shape is correct (106 rows, 47 cols)!")
        else:
            print(f"✘ Incorrect shape: {df.shape}")
            
        is_sorted = df.index.is_monotonic_increasing
        print(f"Sorted chronologically: {is_sorted}")
        if is_sorted:
            print("✔ Sorted correctly!")
        else:
            print("✘ Chronological sorting failed!")
            
        # 2025年データのスポットチェック
        print("2025 values spot check:")
        print(f"  北海道: {df.loc[2025, '北海道']} (Expected: 4985.0)")
        print(f"  東京都: {df.loc[2025, '東京都']} (Expected: 14246.0)")
        print(f"  沖縄県: {df.loc[2025, '沖縄県']} (Expected: 1468.0)")
        if df.loc[2025, '北海道'] == 4985.0 and df.loc[2025, '東京都'] == 14246.0:
            print("✔ Spot check passed!")
        else:
            print("✘ Spot check failed!")

def main():
    data_2025 = extract_2025_population()
    
    csv_raw = 'prefecture_population.csv'
    csv_interp = 'prefecture_population_okinawa_interpolated.csv'
    
    df_raw = append_to_csv(csv_raw, data_2025)
    df_interp = append_to_csv(csv_interp, data_2025)
    
    generate_graphs(df_raw, df_interp)
    verify(df_raw, df_interp)

if __name__ == '__main__':
    main()
