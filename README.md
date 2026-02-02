# Spotibot: Immersive Music & Lighting Controller

**Spotibot** is a seamless fusion of music and ambiance, designed to elevate your listening experience by synchronizing your Spotify playback with your SwitchBot smart lighting system. 

Built with a focus on aesthetics and immersion, Spotibot provides a "Now Playing" display that not only shows your music but *projects* its mood into your room through dynamic lighting.

---

## 🎵 Core Features

### 1. Immersive Music Display
*   **Large Album Art**: A high-fidelity display of the currently playing track's artwork, serving as the visual centerpiece.
*   **Spotify Integration**: Real-time display of track name, artist, and playback status.
*   **Touch Interactions**: 
    *   **Playback Control**: Play, pause, and skip tracks directly from the interface.
    *   **Interactive Art**: Click anywhere on the album art to extract that specific color and instantly apply it to your room lighting.

### 2. Smart Lighting Integration (SwitchBot)
*   **Dynamic Synchronization**: 
    *   **Auto-Sync**: Automatically analyzes the colors of the *Now Playing* album art and updates your lights to match the mood.
    *   **Manual Control**: Override sync with precise RGB adjustments or White Temperature tuning (2700K - 6500K).
*   **Control Panel**:
    *   **Master Power**: Toggle your entire lighting system with one click.
    *   **Brightness**: Fine-tune the intensity of your environment.
    *   **Scene Presets**: Quick-access modes for *Reading*, *Relaxation*, *Focus*, *Movies*, and *Gaming*.

### 3. Refined User Interface
*   **Glassmorphism Design**: A modern, sleek aesthetic featuring blurred backdrops and translucent elements that adapt to the ambient colors.
*   **Spotify Branding**: Consistent visual identity using Spotify's signature Green (#1DB954) for a familiar and premium feel.
*   **Single-Screen Experience**: Optimized layout that fits perfectly on your screen without scrolling, ideal for dedicated wall-mounted tablets or desktop dashboards.

---

## 🛠 Technology Stack

*   **Frontend**: React (v18), Vite
*   **Styling**: Vanilla CSS (Variables, Flexbox, Glassmorphism effects)
*   **APIs**:
    *   **Spotify Web API**: For playback state, track metadata, and album imagery.
    *   **SwitchBot Open API**: For controlling smart bulb power, brightness, color, and temperature.
*   **Color Analysis**: Canvas-based pixel extraction to derive dominant colors from images.

---

## 🚀 Getting Started

### Prerequisites
*   A **Spotify Premium** account.
*   **SwitchBot** devices (Hub 2, Color Bulbs, Strip Lights) set up in the SwitchBot app.
*   SwitchBot **Token** and **Secret** (obtained from the SwitchBot app developer settings).

### Setup
1.  **Launch the App**: Open the application in your browser.
    *   **Local**: `http://localhost:5173/Spotibot/`
    *   **Production**: `https://<YOUR_GITHUB_USERNAME>.github.io/Spotibot/`
2.  **Authenticate Spotify**:
    *   **IMPORTANT**: Go to your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
    *   Edit your App settings and add the following **Redirect URIs**:
        *   `http://localhost:5173/Spotibot/`
        *   `https://<YOUR_GITHUB_USERNAME>.github.io/Spotibot/`
    *   Click "Connect Spotify" in the app to log in.
3.  **Configure SwitchBot**:
    *   Click the "Settings" (Gear) icon.
    *   Enter your SwitchBot `Token` and `Secret`.
    *   (Spotify Client Secret is **no longer required**).
    *   Select the devices you want to control.
4.  **Enjoy**: Start playing music on Spotify!

---

## 🎛 Control Panel Guide

| Control | Description |
| :--- | :--- |
| **Spotify Sync** | Toggle to enable/disable automatic color matching with album art. |
| **Master Power** | Turn all selected devices On or Off. |
| **Brightness** | Slider to adjust light intensity (0-100%). |
| **RGB / White** | Switch between Color mixing mode and Color Temperature mode. |
| **Presets** | One-tap access to pre-defined lighting scenes (Read, Relax, etc.). |

---

*Designed and engineered for the ultimate audiovisual atmosphere.*

---

# Spotibot: 没入型音楽＆照明コントローラー

**Spotibot** は、音楽と空間演出を融合させ、Spotifyの再生楽曲とSwitchBotスマート照明をシンクロさせることで、リスニング体験を向上させるアプリケーションです。

「没入感（Immersion）」と「美学（Aesthetics）」を重視して設計されており、単なる音楽プレーヤーとしてだけでなく、その瞬間のムードを光として部屋全体に拡張します。

---

## 🎵 主な機能

### 1. 没入型音楽ディスプレイ
*   **巨大なアルバムアート**: 再生中のアートワークを大きく表示し、視覚的な中心として機能します。
*   **Spotify統合**: 曲名、アーティスト名、再生状態をリアルタイムで表示します。
*   **タッチ操作**:
    *   **再生コントロール**: 再生・一時停止・スキップなどの操作が可能です。
    *   **インタラクティブ・アート**: アルバムアートの好きな場所をクリックすると、その色を抽出して瞬時に照明へ反映させることができます。

### 2. スマート照明連携 (SwitchBot)
*   **ダイナミック同期**:
    *   **Auto-Sync (自動同期)**: アルバムアートの色を自動解析し、楽曲のムードに合わせて照明色を変化させます。
    *   **手動コントロール**: 同期をオフにして、RGBカラーや色温度（2700K〜6500K）を自由に調整することも可能です。
*   **コントロールパネル**:
    *   **マスター電源**: ワンクリックでライトのオン/オフを一括切り替え。
    *   **明るさ調整**: スライダーで直感的に調光。
    *   **シーンプリセット**: 「読書」「リラックス」「集中」「映画」「ゲーム」などのモードを瞬時に呼び出し。

### 3. 洗練されたUIデザイン
*   **グラスモーフィズム**: すりガラスのような質感と、環境光に合わせて変化する背景を採用。
*   **Spotifyブランディング**: Spotifyグリーン（#1DB954）を基調とした、統一感のあるプレミアムなデザイン。
*   **シングルスクリーン設計**: スクロール不要で全ての機能にアクセスできる、タブレットやデスクトップダッシュボードに最適なレイアウト。

---

## 🛠 技術スタック

*   **フロントエンド**: React (v18), Vite
*   **スタイリング**: Vanilla CSS (CSS変数, Flexbox, Glassmorphism)
*   **API**:
    *   **Spotify Web API**: 再生状況、トラック情報、アートワーク取得
    *   **SwitchBot Open API**: 照明の電源、明るさ、色、色温度制御
*   **画像解析**: Canvas APIを使用したピクセル色抽出

---

## 🚀 始め方

### 必要条件
*   **Spotify Premium** アカウント
*   **SwitchBot** デバイス（ハブ2、スマート電球、テープライト等）のセットアップ済み環境
*   SwitchBot **トークン** と **シークレット**（SwitchBotアプリの開発者設定から取得）

### セットアップ手順
1.  **アプリ起動**: ブラウザでアプリケーションを開きます（例: `http://localhost:5173`）。
2.  **Spotify連携**: 「Connect Spotify」をクリックしてログインし、再生状況の読み取りを許可します。
3.  **SwitchBot設定**:
    *   設定（歯車）アイコンをクリックします。
    *   SwitchBotの `トークン` と `シークレット` を入力します。
    *   検出されたリストから操作したいデバイスを選択します。
4.  **体験開始**: Spotifyで音楽を再生してください。インターフェースが反応し、Auto-Syncがオンであれば部屋の照明が音楽とリンクし始めます。

---

## 🎛 コントロールパネルガイド

| 機能 | 説明 |
| :--- | :--- |
| **Spotify Sync** | アルバムアートとの自動色同期のオン/オフを切り替えます。 |
| **Master Power** | 選択した全デバイスの電源を一括でオン/オフします。 |
| **Brightness** | 照明の明るさを調整します（0-100%）。 |
| **RGB / White** | カラーモード（RGB）と色温度モード（ホワイト）を切り替えます。 |
| **Presets** | 事前に定義された照明シーン（読書、リラックス等）をワンタップで適用します。 |

---

*究極のオーディオビジュアル空間のために設計されました。*
