# По Делам (ex. MAKS LEAD HUB) - Architecture

## 1. Overview
**По Делам** is a premium lead generation platform designed as a Max Mini App (Mini App for Max Messenger). It connects service masters with potential customers by aggregating, processing, and distributing leads.

## 2. Technical Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Animations**: Framer Motion
- **UI Components**: shadcn/ui + Lucide React
- **Backend**: Next.js API Routes (Serverless) / PostgreSQL
- **AI**: DeepSeek / GPT-4 for lead processing

## 3. System Components
### A. Lead Ingestion Engine
- Monitors Max Messenger channels/chats.
- Accepts JSON imports.
- Cleans and categorizes raw text using AI.

### B. Lead Marketplace
- Categorized feed of leads.
- Real-time updates.
- Pay-per-lead or subscription access models.

### C. Admin Control Center
- Economic management (pricing, subscriptions).
- User and lead moderation.
- System settings and API configurations.

## 4. Design Principles
- **Premium Dark Mode**: OLED black (#000000) base.
- **High Contrast**: Accent color (#E6F000) for CTAs.
- **Minimalism**: Large spacing, clean typography, glassmorphism effects.
- **Fluidity**: Smooth transitions between screens.

## 5. Security & Authentication
- Integrated with Max Messenger WebApp API for authentication.
- Role-based access control (User vs. Admin).
- **Notifications**: Users can subscribe to the Max bot to receive direct notifications about new leads.
