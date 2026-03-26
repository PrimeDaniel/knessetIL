# 🏛️ KnessetTrack (מדד הכנסת)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/Backend-Python_FastAPI-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?logo=next.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?logo=docker&logoColor=white)
![GCP](https://img.shields.io/badge/Deployment-GCP-4285F4?logo=google-cloud&logoColor=white)

**KnessetTrack** is a civic transparency web application designed to make the Israeli Parliament's (Knesset) legislative data accessible, visual, and easy to understand for the general public. 

By aggregating data from the [Open Knesset](https://oknesset.org/) project, this platform tracks bills, visualizes party voting records, and profiles individual Members of Knesset (MKs) to promote democratic transparency.

## ✨ Features

* 📊 **Dashboard Analytics:** A high-level overview of recent legislative activity, passed/rejected bills, and trending parliamentary topics.
* 📜 **Bills Directory:** Search, filter, and track the status of current and past bills.
* 🙋‍♂️ **Individual MK Profiles:** Deep dive into specific parliament members to see their overall voting record, rebellion rate, and recent activity.
* 🏢 **Party Cohesion Tracker:** Visualizations showing how unified political parties are during key votes.
* 📱 **Responsive & RTL Ready:** Fully optimized for mobile devices and natively designed for Right-to-Left (Hebrew) reading.

## 🏗️ Architecture & Tech Stack

The project uses a decoupled architecture to ensure high performance and prevent rate-limiting when fetching third-party civic data.

* **Frontend:** Next.js (React), Tailwind CSS, Recharts (for data visualization).
* **Backend:** Python with FastAPI (serving as an API Gateway and caching layer).
* **Database/Cache:** PostgreSQL / Redis (for caching Open Knesset API responses).
* **Infrastructure:** Dockerized containers deployed on Google Cloud Platform (GCP).

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Python (3.10+)
* Docker & Docker Compose

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/PrimeDaniel/KnessetTrack.git](https://github.com/PrimeDaniel/KnessetTrack.git)
    cd KnessetTrack
    ```

2.  **Backend Setup (Python/FastAPI):**
    ```bash
    cd backend
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    pip install -r requirements.txt
    uvicorn main:app --reload
    ```

3.  **Frontend Setup (Next.js):**
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```

4.  **Run with Docker:**
    ```bash
    docker-compose up --build
    ```

## 🔌 API & Data Source

All legislative data is sourced via the [Open Knesset API](https://oknesset.org/api/v2/). KnessetTrack periodically fetches, transforms, and caches this data to serve it efficiently to end-users. Huge thanks to "Hasadna" (The Public Knowledge Workshop) for maintaining the core data infrastructure.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/PrimeDaniel/KnessetTrack/issues) if you want to contribute.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 📧 Contact

**Daniel** - [GitHub Profile](https://github.com/PrimeDaniel)

Project Link: [https://github.com/PrimeDaniel/KnessetTrack](https://github.com/PrimeDaniel/KnessetTrack)
