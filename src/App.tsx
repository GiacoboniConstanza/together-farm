import { Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage";
import { FarmPage } from "./pages/FarmPage";
import { HomePage } from "./pages/HomePage";
import { InvitePage } from "./pages/InvitePage";
import { useSession } from "./hooks/useSession";

function App() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="tf-panel px-10 py-5 text-center font-display text-lg font-semibold text-ui-ink">
          Cargando…
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <HomePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        path="/farm/:farmId"
        element={session ? <FarmPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/invite/:token"
        element={session ? <InvitePage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
