import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ChatPage } from "./pages/ChatPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { HomepageLayout } from "./layout/HomepageLayout";
import DocumentsPage from "./pages/DocumentsPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomepageLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ChatPage />} />

          <Route path="documents" element={<DocumentsPage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
              <p className="text-[var(--text-secondary)]">Page not found</p>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
