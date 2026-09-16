import glob
import pandas as pd
import numpy as np
import re
import os

def clean_pref_name(name):
    if not isinstance(name, str):
        return ""
    return re.sub(r'\s+', '', name)

def to_int_year(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    m = re.search(r'\d+', s)
    if m:
        return int(m.group(0))
    return None

def main():
    print("Processing population Excel files...")
    
    # 1. 都道府県コード -> 名前のマッピングを構築
    # 2024年のファイルを基準にして、都道府県コードと名前を対応付ける
    df_ref = pd.read_excel('05k2024-2.xlsx', sheet_name='第2表', header=None)
    pref_map = {}
    for idx, row in df_ref.iterrows():
        code = pd.to_numeric(row[1], errors='coerce')
        if not pd.isna(code) and 1 <= code <= 47:
            pref_map[int(code)] = clean_pref_name(row[2])
    
    if len(pref_map) != 47:
        print(f"Error: Could not construct complete prefecture map. Found {len(pref_map)} prefectures.")
        return

    # データを格納する辞書: (year, pref_code) -> value
    # valueは千人単位の総人口（男女計）
    data = {}
    
    # 2. 1920年 - 2000年 (05k5-5.xlsx)
    f_1920_2000 = '05k5-5.xlsx'
    if os.path.exists(f_1920_2000):
        print(f"Reading {f_1920_2000}...")
        df = pd.read_excel(f_1920_2000, sheet_name='第5表', header=None)
        years = []
        for col in range(4, df.shape[1]):
            yr = to_int_year(df.iloc[7, col])
            if yr is not None:
                years.append((col, yr))
        
        for idx, row in df.iterrows():
            code = pd.to_numeric(row[1], errors='coerce')
            if not pd.isna(code) and 1 <= code <= 47:
                code = int(code)
                for col, yr in years:
                    val = pd.to_numeric(row[col], errors='coerce')
                    data[(yr, code)] = val

    # 3. 2000年 - 2015年 (05k5-5(1).xlsx - 総人口（2000年～2015年）)
    f_2000_2020 = '05k5-5(1).xlsx'
    if os.path.exists(f_2000_2020):
        print(f"Reading {f_2000_2020} (2000-2015)...")
        df = pd.read_excel(f_2000_2020, sheet_name='総人口（2000年～2015年）', header=None)
        years_2000_2015 = []
        for col in range(4, df.shape[1]):
            yr = to_int_year(df.iloc[8, col])
            if yr is not None:
                years_2000_2015.append((col, yr))
        
        for idx, row in df.iterrows():
            code = pd.to_numeric(row[1], errors='coerce')
            if not pd.isna(code) and 1 <= code <= 47:
                code = int(code)
                for col, yr in years_2000_2015:
                    val = pd.to_numeric(row[col], errors='coerce')
                    data[(yr, code)] = val

    # 4. 2015年 - 2020年 (05k5-5(1).xlsx - 総人口 (2015年～2020年))
    if os.path.exists(f_2000_2020):
        print(f"Reading {f_2000_2020} (2015-2020)...")
        df = pd.read_excel(f_2000_2020, sheet_name='総人口 (2015年～2020年)', header=None)
        years_2015_2020 = []
        for col in range(4, df.shape[1]):
            yr = to_int_year(df.iloc[8, col])
            if yr is not None:
                years_2015_2020.append((col, yr))
        
        for idx, row in df.iterrows():
            code = pd.to_numeric(row[1], errors='coerce')
            if not pd.isna(code) and 1 <= code <= 47:
                code = int(code)
                for col, yr in years_2015_2020:
                    val = pd.to_numeric(row[col], errors='coerce')
                    data[(yr, code)] = val

    # 5. 2021年 - 2024年 (05k2021-2.xlsx ~ 05k2024-2.xlsx)
    for yr in range(2021, 2025):
        f = f'05k{yr}-2.xlsx'
        if os.path.exists(f):
            print(f"Reading {f}...")
            df = pd.read_excel(f, sheet_name='第2表', header=None)
            for idx, row in df.iterrows():
                code = pd.to_numeric(row[1], errors='coerce')
                if not pd.isna(code) and 1 <= code <= 47:
                    code = int(code)
                    val = pd.to_numeric(row[4], errors='coerce')
                    data[(yr, code)] = val

    # 6. DataFrameの作成と整形
    all_years = sorted(list(set(k[0] for k in data.keys())))
    
    # 縦軸に年、横軸に都道府県のDataFrameを作成
    # 都道府県はコードの順（1〜47）に並べる
    out_data = []
    for yr in all_years:
        row_dict = {'年': yr}
        for code in range(1, 48):
            pref_name = pref_map[code]
            row_dict[pref_name] = data.get((yr, code), np.nan)
        out_data.append(row_dict)
        
    df_out = pd.DataFrame(out_data)
    df_out.set_index('年', inplace=True)
    
    # CSVファイルへの書き出し
    csv_filename = 'prefecture_population.csv'
    df_out.to_csv(csv_filename, encoding='utf-8-sig')
    print(f"Saved compiled data to {csv_filename}")
    
    # 7. 検証
    print("\n--- Verification ---")
    print(f"Shape of DataFrame: {df_out.shape}")
    print(f"Expected shape: (105, 47)")
    if df_out.shape == (105, 47):
        print("✔ Shape is correct!")
    else:
        print("✘ Shape mismatch!")
        
    # 欠損値のチェック
    null_count = df_out.isnull().sum().sum()
    print(f"Number of null values: {null_count}")
    if null_count == 0:
        print("✔ No missing values!")
    else:
        print(f"✘ Found {null_count} missing values!")
        
    # 年の昇順チェック
    is_years_sorted = df_out.index.is_monotonic_increasing
    print(f"Are years sorted in increasing order? {is_years_sorted}")
    if is_years_sorted:
        print("✔ Years are sorted correctly!")
    else:
        print("✘ Years are not sorted correctly!")

    # 列順チェック（都道府県コード順）
    expected_cols = [pref_map[code] for code in range(1, 48)]
    is_cols_correct = list(df_out.columns) == expected_cols
    print(f"Are columns in prefecture code order? {is_cols_correct}")
    if is_cols_correct:
        print("✔ Columns are sorted correctly by prefecture code!")
    else:
        print("✘ Column order mismatch!")

if __name__ == '__main__':
    main()
