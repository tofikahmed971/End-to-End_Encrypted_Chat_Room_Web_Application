# End-to-End Encrypted Chat Room Web Application

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen.svg)](https://shiny-robinet-notmy-7eca6845.koyeb.app/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue.svg)](https://github.com/tofikahmed971/End-to-End_Encrypted_Chat_Room_Web_Application)

**End-to-End Encrypted Chat Room Web Application** is a secure, end-to-end encrypted (E2EE) chat room web application designed for privacy, anonymity, and ephemerality. It allows users to create temporary chat rooms with unique access codes, ensuring that conversations remain private and leave no trace on the server.

## 🚀 Live Demo

Check out the live application here: **[https://shiny-robinet-notmy-7eca6845.koyeb.app/](https://shiny-robinet-notmy-7eca6845.koyeb.app/)**

## ✨ Key Features

*   **End-to-End Encryption (E2EE):** Messages are encrypted on the sender's device using **AES-256-GCM** and **RSA-OAEP** (Web Crypto API) before transmission. The server acts as a blind relay and cannot decrypt messages.
*   **Zero-Knowledge Architecture:** The server has no access to private keys or message content.
*   **Ephemerality:**
    *   **In-Memory Storage:** Active rooms and participant lists are stored exclusively in volatile server memory (RAM).
    *   **No Logs:** Messages are never written to a database or disk.
    *   **Auto-Destruction:** All room data is instantly wiped when the room is empty or the server restarts.
*   **Anonymity:** No account registration required. Users join via unique 6-character room codes.
*   **Secure File Sharing:** Share files securely with on-the-fly encryption.
*   **Real-Time Communication:** Powered by **Socket.IO** for low-latency messaging.
*   **Modern UI:** A responsive, cyberpunk-inspired interface built with **Next.js 16** and **Tailwind CSS**.

## 🛠️ Technology Stack

*   **Frontend:** [Next.js 16](https://nextjs.org/) (App Router), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
*   **Backend:** [Node.js](https://nodejs.org/), [Socket.IO](https://socket.io/)
*   **Cryptography:** [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) (Native Browser Standard)
*   **Database:** [MongoDB](https://www.mongodb.com/) (Strictly for optional user accounts; **NOT** used for room/message storage)
*   **Deployment:** [Koyeb](https://www.koyeb.com/) (or similar Docker-based platforms)

## 📦 Installation & Getting Started

Follow these steps to run the project locally:

### Prerequisites

*   Node.js v18.17.0 or later
*   npm, yarn, pnpm, or bun

### Steps

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/tofikahmed971/End-to-End_Encrypted_Chat_Room_Web_Application.git
    cd End-to-End_Encrypted_Chat_Room_Web_Application
    ```

2.  **Install Dependencies**

    ```bash
    npm install
    # or
    bun install
    ```

3.  **Environment Setup**

    Create a `.env.local` file in the root directory and add the following variables (if applicable for your local setup, otherwise the app runs in default mode):

    ```env
    MONGODB_URI=your_mongodb_connection_string
    NEXTAUTH_SECRET=your_nextauth_secret
    ```
    *(Note: MongoDB is optional for core chat functionality)*

4.  **Run the Development Server**

    ```bash
    npm run dev
    # or
    bun dev
    ```

5.  **Access the App**

    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛡️ Security Details

*   **Key Exchange:** Uses **RSA-OAEP (2048-bit)** for secure key exchange between participants.
*   **Message Encryption:** Uses **AES-256-GCM** for symmetric encryption of messages and files.
*   **Signatures:** Uses **ECDSA (P-256)** for digital signatures to verify sender identity and message integrity.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).