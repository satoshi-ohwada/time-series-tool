#!/usr/bin/env python3
"""
ローカル確認用 HTTP サーバ起動スクリプト
- 外部ライブラリ不要（Python 3 標準ライブラリのみで動作）
- 開発・確認時のキャッシュによる更新不反映を防ぐため Cache-Control: no-cache を付与
- 利用可能なポートを自動検出（デフォルト: 8000）
- ブラウザを自動オープン
"""

import sys
import os
import socket
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

DEFAULT_PORT = 8000
MAX_PORT_ATTEMPTS = 20

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 開発・確認時にJSモジュールやCSSがキャッシュされるのを防ぐヘッダー
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # ログ出力を簡潔に
        sys.stderr.write(f"[{self.log_date_time_string()}] {args[0]} {args[1]}\n")

def find_available_port(start_port=DEFAULT_PORT):
    for port in range(start_port, start_port + MAX_PORT_ATTEMPTS):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

def run():
    # スクリプトの存在するディレクトリをルートとして配信
    root_dir = Path(__file__).resolve().parent
    os.chdir(root_dir)

    port = find_available_port(DEFAULT_PORT)
    server_address = ('127.0.0.1', port)
    
    httpd = HTTPServer(server_address, NoCacheHTTPRequestHandler)
    url = f"http://localhost:{port}/index.html"
    
    print("=" * 60)
    print("  🚀 簡易時系列分析ツール - ローカル確認用サーバ")
    print("=" * 60)
    print(f"  URL: {url}")
    print(f"  公開ディレクトリ: {root_dir}")
    print("  ※ 開発用にブラウザキャッシュ無効化 (no-cache) が有効です")
    print("  終了するには Ctrl + C を押してください")
    print("=" * 60)

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\nサーバを停止しました。")
        httpd.server_close()

if __name__ == '__main__':
    run()
