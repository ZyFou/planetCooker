# Procedural Planet Studio - React + Tailwind CSS

A modern procedural planet generator with interactive 3D controls and orbital simulation, built with React 18, Vite, and Tailwind CSS.

## 🌟 Features

- **Interactive 3D Planet Generation**: Create procedurally generated planets with realistic physics
- **Real-time Controls**: Adjust atmosphere, rings, moons, and stars with science-inspired controls
- **System Sharing**: Share fully reproducible planets with a single code
- **Modern UI**: Beautiful, responsive interface built with Tailwind CSS
- **Component Architecture**: Modular React components for maintainability
- **Performance Optimized**: Built with Vite for fast development and production builds

## 🚀 Tech Stack

- **Frontend**: React 18 with Hooks
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **3D Graphics**: Three.js
- **Routing**: React Router DOM
- **UI Controls**: Lil-GUI
- **Noise Generation**: Simplex Noise

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd planet-creator
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## 🛠️ Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── SystemCard.jsx   # System display card
│   ├── SystemActions.jsx # Action buttons for systems
│   ├── PreviewPanel.jsx # System preview panel
│   ├── FiltersPanel.jsx # Search and filter controls
│   ├── Pagination.jsx   # Pagination component
│   └── Studio3D.jsx     # 3D scene component
├── hooks/               # Custom React hooks
│   ├── useApi.js        # API data fetching hooks
│   └── useUtils.js      # Utility hooks (formatting, clipboard)
├── pages/               # Route-level components
│   ├── Landing.jsx      # Home page
│   ├── Studio.jsx       # 3D planet editor
│   └── Explore.jsx      # Browse shared systems
├── app/                 # Legacy modules (Three.js integration)
│   ├── config.js        # API configuration
│   ├── gui/             # GUI control modules
│   ├── onboarding.js    # Tutorial system
│   ├── shareCore.js     # System sharing functionality
│   ├── stars.js         # Starfield generation
│   ├── textures.js      # Texture generation
│   └── utils.js         # Utility functions
├── App.jsx              # Main app component with routing
├── main.jsx             # React entry point
└── index.css            # Tailwind CSS imports
```

## 🎨 Design System

The application uses a custom design system built with Tailwind CSS:

### Colors
- **Primary**: Blue gradient palette for interactive elements
- **Dark**: Slate color palette for backgrounds and text
- **Accent**: Purple and blue accents for highlights

### Components
- **Buttons**: Three variants (primary, secondary, ghost) with hover effects
- **Cards**: Consistent border radius and shadow system
- **Forms**: Styled inputs and controls with focus states

### Typography
- **Font**: Segoe UI, Roboto, sans-serif
- **Scale**: Responsive typography with clamp() for fluid sizing
- **Weight**: Semibold for headings, regular for body text

## 🔧 Configuration

### API Configuration
The API base URL is configured in `src/app/config.js`:
```javascript
export const API_BASE_URL = 'https://zyfod.dev/planetApi/api'
```

### Tailwind Configuration
Custom Tailwind configuration in `tailwind.config.js` includes:
- Custom color palette
- Extended animations
- Custom font family
- Responsive design tokens

## 🚀 Deployment

1. Build the project:
```bash
npm run build
```

2. The `dist/` folder contains the production-ready files

3. Deploy the contents of `dist/` to your hosting provider

## 🔄 Migration Notes

This project was migrated from vanilla HTML/CSS/JavaScript to React + Tailwind CSS:

### What Changed
- **HTML Pages** → **React Components**: Each HTML page became a React component
- **Vanilla JS** → **React Hooks**: Global JavaScript became custom hooks and components
- **Plain CSS** → **Tailwind Utilities**: All styling converted to Tailwind classes
- **Manual DOM** → **React State**: Direct DOM manipulation replaced with React state

### What Stayed
- **Three.js Integration**: All 3D functionality preserved
- **API Integration**: Backend communication unchanged
- **Core Features**: All planet generation features maintained
- **Performance**: Optimized with React's virtual DOM and Vite's bundling

### Benefits
- **Maintainability**: Component-based architecture
- **Developer Experience**: Hot reload, TypeScript support, modern tooling
- **Performance**: Optimized bundle splitting and lazy loading
- **Accessibility**: Better semantic HTML and ARIA support
- **Responsive Design**: Mobile-first approach with Tailwind

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Three.js community for excellent 3D graphics library
- Tailwind CSS team for the utility-first CSS framework
- React team for the component-based UI library
- Vite team for the fast build tool