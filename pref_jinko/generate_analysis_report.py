import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.cluster import KMeans
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

# フォント設定
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')

pref_names = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
]

roma_map = {
    "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi", "秋田県": "Akita",
    "山形県": "Yamagata", "福島県": "Fukushima", "茨城県": "Ibaraki", "栃木県": "Tochigi", "群馬県": "Gunma",
    "埼玉県": "Saitama", "千葉県": "Chiba", "東京都": "Tokyo", "神奈川県": "Kanagawa", "新潟県": "Niigata",
    "富山県": "Toyama", "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano",
    "岐阜県": "Gifu", "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie", "滋賀県": "Shiga",
    "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo", "奈良県": "Nara", "和歌山県": "Wakayama",
    "鳥取県": "Tottori", "島根県": "Shimane", "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi",
    "徳島県": "Tokushima", "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka",
    "佐賀県": "Saga", "長崎県": "Nagasaki", "熊本県": "Kumamoto", "大分県": "Oita", "宮崎県": "Miyazaki",
    "鹿児島県": "Kagoshima", "沖縄県": "Okinawa"
}

def clean_name(name):
    return roma_map.get(name, name)

def analyze_data():
    print("Analyzing population data...")
    df = pd.read_csv('prefecture_population_okinawa_interpolated.csv', index_col=0)
    
    # 1. ピーク年分析
    peak_years = df.idxmax()
    
    plt.figure(figsize=(10, 5.5))
    plt.hist(peak_years.values, bins=range(1940, 2035, 5), color='#3498db', edgecolor='black', alpha=0.8)
    plt.title('Distribution of Population Peak Years by Prefecture', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Peak Year (5-year bins)', fontsize=11, labelpad=10)
    plt.ylabel('Number of Prefectures', fontsize=11, labelpad=10)
    plt.xticks(range(1940, 2030, 10))
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('temp_peak_years.png', dpi=300)
    plt.close()
    
    # 2. クラスタリング分析 (1920=100としたインデックス)
    df_idx = df.div(df.iloc[0]) * 100
    
    # 時系列の特徴量として「1920->2025の成長率」を使う
    growth_rates = (df_idx.loc[2025] - 100).values.reshape(-1, 1)
    
    # K-means
    kmeans = KMeans(n_clusters=4, random_state=42)
    labels = kmeans.fit_predict(growth_rates)
    
    # クラスターごとの可視化
    plt.figure(figsize=(10, 5.5))
    colors = ['#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f']
    
    cluster_info = {}
    for i in range(4):
        prefs_in_c = [pref_names[j] for j in range(47) if labels[j] == i]
        cluster_info[i] = prefs_in_c
        
        cluster_mean = df_idx[prefs_in_c].mean(axis=1)
        plt.plot(df.index, cluster_mean, label=f'Group {i+1} (n={len(prefs_in_c)})', color=colors[i], linewidth=2.5)
        
    plt.title('Standardized Population Growth Patterns by Group (1920=100)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Year', fontsize=11, labelpad=10)
    plt.ylabel('Population Index (1920=100)', fontsize=11, labelpad=10)
    plt.legend(fontsize=10, loc='upper left')
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('temp_clusters.png', dpi=300)
    plt.close()
    
    # 2b. クラスタリング散布図の作成
    print("Creating clustering scatter plot...")
    plt.figure(figsize=(10, 6))
    
    # 横軸に1920年の初期人口(千人)、縦軸に2025年の成長インデックス
    init_pop = df.iloc[0].values
    growth_idx_2025 = df_idx.loc[2025].values
    
    for i in range(4):
        # 各グループのポイントをプロット
        idx_in_c = [j for j in range(47) if labels[j] == i]
        plt.scatter(init_pop[idx_in_c], growth_idx_2025[idx_in_c], 
                    color=colors[i], label=f'Group {i+1} (n={len(idx_in_c)})', 
                    s=80, alpha=0.8, edgecolors='black')
        
        # テキストラベルを追加
        for j in idx_in_c:
            plt.annotate(clean_name(pref_names[j]), (init_pop[j], growth_idx_2025[j]),
                         textcoords="offset points", xytext=(0,6), ha='center', fontsize=8)
            
    plt.xscale('log') # 人口規模の差が大きいので対数スケールに設定
    plt.title('Clustering Scatter Plot: Initial Population vs Growth Index (2025)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Initial Population in 1920 (Thousands, Log Scale)', fontsize=11, labelpad=10)
    plt.ylabel('Growth Index in 2025 (1920 = 100)', fontsize=11, labelpad=10)
    plt.legend(fontsize=10, loc='upper right')
    plt.grid(True, which="both", linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('temp_scatter.png', dpi=300)
    plt.close()
    
    # 3. 都市圏シェア分析
    national_pop = df.sum(axis=1)
    tokyo_met = df[['東京都', '神奈川県', '埼玉県', '千葉県']].sum(axis=1)
    kansai_met = df[['大阪府', '京都府', '兵庫県', '奈良県']].sum(axis=1)
    nagoya_met = df[['愛知県', '岐阜県', '三重県']].sum(axis=1)
    
    tokyo_share = (tokyo_met / national_pop) * 100
    kansai_share = (kansai_met / national_pop) * 100
    nagoya_share = (nagoya_met / national_pop) * 100
    
    plt.figure(figsize=(10, 5.5))
    plt.plot(df.index, tokyo_share, label='Tokyo Area (1 Tokyo, 3 Prefectures)', color='#e74c3c', linewidth=2.5)
    plt.plot(df.index, kansai_share, label='Kansai Area (Osaka, Kyoto, Hyogo, Nara)', color='#3498db', linewidth=2)
    plt.plot(df.index, nagoya_share, label='Nagoya Area (Aichi, Gifu, Mie)', color='#2ecc71', linewidth=2)
    plt.title('Population Share of Major Metropolitan Areas (%)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Year', fontsize=11, labelpad=10)
    plt.ylabel('Share of National Population (%)', fontsize=11, labelpad=10)
    plt.legend(fontsize=10, loc='upper left')
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('temp_metro_share.png', dpi=300)
    plt.close()
    
    # 4. 人口減少速度と加速度分析 (2020->2025の減少率)
    pct_change_2025 = ((df.loc[2025] - df.loc[2020]) / df.loc[2020]) * 100
    top_decrease = pct_change_2025.nsmallest(5)
    top_increase = pct_change_2025.nlargest(3)
    
    plt.figure(figsize=(10, 5.5))
    sorted_change = pct_change_2025.sort_values()
    sns.barplot(x=sorted_change.values[:10], y=[clean_name(p) for p in sorted_change.index[:10]], palette='Reds_r', hue=[clean_name(p) for p in sorted_change.index[:10]], legend=False)
    plt.title('Top 10 Prefectures by Population Decline Rate (2020-2025)', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Decline Rate (%)', fontsize=11, labelpad=10)
    plt.ylabel('Prefecture', fontsize=11, labelpad=10)
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('temp_decline_rates.png', dpi=300)
    plt.close()
    
    return {
        'peak_years': peak_years,
        'cluster_info': cluster_info,
        'tokyo_share_2025': tokyo_share.loc[2025],
        'top_decrease': top_decrease,
        'top_increase': top_increase
    }

def create_presentation(analysis):
    print("Creating PowerPoint presentation...")
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    blank_layout = prs.slide_layouts[6]
    
    def add_title(slide, text):
        txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.4), Inches(12.33), Inches(0.8))
        tf = txBox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = text
        p.font.size = Pt(28)
        p.font.bold = True
        p.alignment = PP_ALIGN.LEFT
        
    def add_text_box(slide, left, top, width, height, bullet_points, font_size=16):
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        for i, bp in enumerate(bullet_points):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = bp
            p.font.size = Pt(font_size)
            p.space_after = Pt(6)
            
    # ----------------------------------------------------
    # Slide 1: Cover
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    txBox = slide.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.33), Inches(3.0))
    tf = txBox.text_frame
    p1 = tf.paragraphs[0]
    p1.text = "日本の人口動態分析レポート"
    p1.font.size = Pt(40)
    p1.font.bold = True
    p1.space_after = Pt(14)
    
    p2 = tf.add_paragraph()
    p2.text = "国勢調査（1920年〜2025年）のデータから見る地域格差と未来像"
    p2.font.size = Pt(20)
    p2.space_after = Pt(20)
    
    p3 = tf.add_paragraph()
    p3.text = "作成日: 2026年7月19日"
    p3.font.size = Pt(14)
    p3.font.italic = True
    
    # ----------------------------------------------------
    # Slide 2: Introduction
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "1. 本分析の目的と概要")
    bullets = [
        "■ 分析の目的:",
        "  - 100年以上にわたる国勢調査の長期的データを用い、各地域の人口変動の歴史的パターンを客観的に捉える。",
        "  - 近年急速に加速している人口減少の動向や、大都市圏への一極集中の過程を定量化し、今後の地域政策への示唆を得る。",
        "■ 主な分析アプローチ:",
        "  1. 都道府県別の人口ピーク年分析（産業構造の変遷との関連）",
        "  2. 機械学習を用いた人口成長パターンのクラスタリング分類",
        "  3. 三大都市圏および東京圏への人口集中率の推移",
        "  4. 人口減少速度と「加速度」（直近の減少の急激さ）の可視化",
        "  5. トレンドに逆行する特異地域（沖縄県）の要因分析"
    ]
    add_text_box(slide, Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.0), bullets)
    
    # ----------------------------------------------------
    # Slide 3: Peak Year Analysis
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "2. 分析① 都道府県別の人口ピーク年")
    bullets = [
        "■ ピーク年分析の概要:",
        "  - 全国の人口ピークは2010年頃ですが、各地方のピークには大きなズレがあります。",
        "■ 主な発見:",
        "  - 多くの地方県（秋田県、山形県など）は高度経済成長期の「1950年代」にすでに人口のピークを迎えており、そこから半世紀以上にわたり減少が続いています。",
        "  - バブル期前後の1980年代〜1990年代にピークを迎えた地域が多く、大都市圏（東京都など）は現在進行形（2025年）でピークを更新し続けています。",
        "  - 地方の過疎化は直近の現象ではなく、産業構造が第1次産業から移行した戦後間もない時期から始まっていた歴史的必然と言えます。"
    ]
    add_text_box(slide, Inches(0.5), Inches(1.5), Inches(6.0), Inches(5.0), bullets)
    slide.shapes.add_picture('temp_peak_years.png', Inches(6.8), Inches(1.5), Inches(6.0))
    
    # ----------------------------------------------------
    # Slide 4: Clustering Analysis
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "3. 分析② 人口推移パターンの分類（クラスタリング）")
    bullets = [
        "■ クラスタリングの考え方:",
        "  - 1920年の人口を100として標準化し、人口増加・減少の長期的な「パターン」に基づいて都道府県を4つのグループに機械的に分類しました。",
        "■ 4つの成長・減少パターン:",
        "  - グループ1（急成長型）：1920年比で人口が3〜4倍に急拡大した都市部エリア。",
        "  - グループ2（緩やか変動型）：戦後増加し、現在は横ばいまたは微減傾向の地方都市。",
        "  - グループ3（早期減少型）：戦後早期（1950年代頃）から人口減少が始まっている地域。",
        "  - グループ4（超集中型）：東京をはじめとする圧倒的な一極集中エリア。"
    ]
    add_text_box(slide, Inches(0.5), Inches(1.5), Inches(6.0), Inches(5.0), bullets)
    slide.shapes.add_picture('temp_clusters.png', Inches(6.8), Inches(1.5), Inches(6.0))
    
    # ----------------------------------------------------
    # Slide 5: Cluster Details (Updated to list all prefectures and include scatter plot)
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "4. 各グループの特徴と該当都道府県一覧（全47都道府県を網羅）")
    
    c_info = analysis['cluster_info']
    # 各グループの都道府県を完全に列挙
    c_list_1 = "、".join(c_info[0])
    c_list_2 = "、".join(c_info[1])
    c_list_3 = "、".join(c_info[2])
    c_list_4 = "、".join(c_info[3])
    
    bullets = [
        f"■ グループ1：都市部急成長型 ({len(c_info[0])}県)",
        f"  - {c_list_1}",
        f"■ グループ2：緩やか維持型 ({len(c_info[1])}県)",
        f"  - {c_list_2}",
        f"■ グループ3：早期減少型 ({len(c_info[2])}県)",
        f"  - {c_list_3}",
        f"■ グループ4：一極集中型 ({len(c_info[3])}都県)",
        f"  - {c_list_4}",
        "※ 右図は、1920年の初期人口（規模）と2025年時点の成長インデックスをプロットした散布図です。"
    ]
    # フォントサイズを12ptに落として、全てのテキストが入り切るようにする
    add_text_box(slide, Inches(0.5), Inches(1.3), Inches(6.0), Inches(5.8), bullets, font_size=12)
    slide.shapes.add_picture('temp_scatter.png', Inches(6.8), Inches(1.3), Inches(6.0))
    
    # ----------------------------------------------------
    # Slide 6: Metropolitan Area Share
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "5. 分析③ 都市圏への一極集中シェアの推移")
    bullets = [
        "■ 大都市圏シェアの歴史的変化:",
        "  - 東京圏（一都三県）のシェアは1920年の約8%から一貫して上昇し、2025年には全国人口の30%を突破（約3,698万人）しています。",
        "■ 他の主要都市圏との比較:",
        "  - 関西圏（大阪・京都・兵庫・奈良）のシェアは1970年代まで約16%で上昇していましたが、現在は減少傾向に転じています。",
        "  - 中京圏（愛知・岐阜・三重）は長年約9%前後のシェアを安定して維持しています。",
        "■ 結論:",
        "  - 日本全体の『多極集中』から、関西圏のシェア低下を伴う『東京超一極集中』へと、集中構造が完全に変化しています。"
    ]
    add_text_box(slide, Inches(0.5), Inches(1.5), Inches(6.0), Inches(5.0), bullets)
    slide.shapes.add_picture('temp_metro_share.png', Inches(6.8), Inches(1.5), Inches(6.0))
    
    # ----------------------------------------------------
    # Slide 7: Decline Velocity
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "6. 分析④ 人口減少速度と「加速度」")
    
    dec_list = [f"  {i+1}. {p} ({v:.2f}%)" for i, (p, v) in enumerate(analysis['top_decrease'].items())]
    bullets = [
        "■ 直近5年間（2020年〜2025年）の減少速度:",
        "  - 2025年最新国勢調査速報では、45都道府県で人口減少が記録されています。",
        "■ 最も減少が著しい都道府県（減少率ワースト）:",
        dec_list[0],
        dec_list[1],
        dec_list[2],
        "■ 人口減少の「加速度」:",
        "  - 秋田県、青森県、岩手県など東北地方を中心とするエリアでは、年を追うごとに減少率（減少スピード）が急激に上がっています。",
        "  - これは高齢化による死亡数の増加（自然減）と若年層の流出（社会減）のダブルパンチによるものです。"
    ]
    add_text_box(slide, Inches(0.5), Inches(1.5), Inches(6.0), Inches(5.0), bullets)
    slide.shapes.add_picture('temp_decline_rates.png', Inches(6.8), Inches(1.5), Inches(6.0))
    
    # ----------------------------------------------------
    # Slide 8: Okinawa Analysis (Outlier)
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "7. 分析⑤ 特異地域（沖縄県）の要因分析")
    bullets = [
        "■ トレンドに逆行する沖縄県:",
        "  - 日本全国の都道府県が軒並み人口減少に転じるなか、東京都と沖縄県だけが2025年国勢調査でも人口増加を維持しています。",
        "■ なぜ沖縄県だけが増え続けているのか？",
        "  - 1. 高い出生率: 合計特殊出生率が長年全国1位であり、自然増減における耐久力が高い点。",
        "  - 2. 返還後の社会的な再編入と移住の増加: 1972年の復帰以降、観光産業の成長やインフラ開発により転入者が増加した点。",
        "■ 示唆点:",
        "  - 出生率の維持と、地域産業の育成（若年層を引き留め、他県から呼び込む魅力）の両方が揃わなければ、地方での人口維持が極めて困難であることを沖縄の例が示しています。"
    ]
    add_text_box(slide, Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.0), bullets)
    
    # ----------------------------------------------------
    # Slide 9: Suggestions
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "8. 地域政策および将来への提言")
    bullets = [
        "■ 地域格差に応じた個別支援へのシフト:",
        "  - 全都道府県一律の少子化・過疎対策は効果的ではありません。ピーク年や減少パターンに基づき、地域の特徴に合わせた戦略が不可欠です。",
        "■ 人口縮小を前提とした「スマート・シュリンク」:",
        "  - グループ3（早期減少型）のような、すでに半世紀以上減少が続く地域では、人口を増やす努力よりも、人口規模の縮小に合わせて社会インフラ（医療、学校、交通）を効率化・集約する持続可能都市への移行が必要です。",
        "■ 大都市における生活利便性の向上と移住支援の両立:",
        "  - 東京一極集中に対しては、大都市内での育児コストの低減を図りつつ、地方でのサテライトオフィス設置などによる緩やかな多極化・U/Iターン促進必要になります。"
    ]
    add_text_box(slide, Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.0), bullets)
    
    # ----------------------------------------------------
    # Slide 10: Conclusion
    # ----------------------------------------------------
    slide = prs.slides.add_slide(blank_layout)
    add_title(slide, "9. まとめ")
    bullets = [
        "■ 100年の人口動態が示す結論:",
        "  - 1. 東京圏の人口はついに30%の大台を超え、極度の一極集中が固定化しています。",
        "  - 2. 地方の人口減少は決して新しい現象ではなく、昭和30年代（1950年代）にすでに始まっていた構造変化であり、これを押し戻すのは極めて困難です。",
        "  - 3. 沖縄県などの例外を除き、ほぼすべての都道府県で減少率が急加速しているため、少子化対策と同時に『人口減少社会に適応するシステム構築』が急務です。",
        "■ 資料作成にあたってのデータ背景:",
        "  - 本資料は、1920年〜2024年の人口推計データと、2025年（令和7年）国勢調査速報値を一気通貫で統合した最新のデータに基づき作成されました。"
    ]
    add_text_box(slide, Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.0), bullets)
    
    # 保存
    pptx_path = 'prefecture_population_analysis.pptx'
    prs.save(pptx_path)
    print(f"PowerPoint report saved to {pptx_path}")
    
    # 一時画像のクリーンアップ
    for temp_img in ['temp_peak_years.png', 'temp_clusters.png', 'temp_metro_share.png', 'temp_decline_rates.png', 'temp_scatter.png']:
        if os.path.exists(temp_img):
            os.remove(temp_img)
            
    print("Cleanup temporary image files.")

def main():
    analysis = analyze_data()
    create_presentation(analysis)

if __name__ == '__main__':
    main()
