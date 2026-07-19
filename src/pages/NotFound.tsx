import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="hero-gradient dot-grid min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h1 className="text-7xl font-extrabold text-white">404</h1>
        <p className="mt-3 text-muted-foreground">This page hasn't been built yet — you're on Slice 1.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
