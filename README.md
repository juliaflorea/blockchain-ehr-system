# blockchain-ehr-system

A blockchain-based EHR (Electronic Health Records) system that enables secure, decentralized storage and access to patient data using IPFS and AES–GCM encryption.

---

## 🔍 Overview
This project explores how blockchain and decentralized storage can enhance data privacy, integrity, and patient control over health records.

---

## 🧠 Features
- AES-256-GCM file encryption
- Elliptic Curve (ECIES/libsodium) key sharing
- Keccak-256 on-chain commitments
- IPFS-based decentralized file storage
- Role-based access: patients, doctors, and proxies
- LLM-based assistant for medical data explanation

---

## ⚙️ Architecture

- `MedicalDataRegistry` – manages encrypted patient data
- `AccessControlManager` – handles roles and permissions
- `ClaimsAndTreatment` – logs medical actions by doctors
- `BlockchainVerifier` – verifies commitments and hashes

---

## 🧰 Tech Stack
- Solidity / Ethereum
- IPFS
- Web3.js or Ethers.js
- AES–GCM, ECIES / libsodium
-  Node.js

---

## 🚀 Getting Started
1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/decentralized-medical-records.git
   cd blockchain-ehr-system
