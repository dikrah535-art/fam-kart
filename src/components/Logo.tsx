import { ShoppingCart } from "lucide-react";

export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <ShoppingCart className="text-primary" size={size} strokeWidth={2.5} />
      <span className="font-extrabold tracking-tight text-white" style={{ fontSize: size * 0.9 }}>
        FamKart
      </span>
    </div>
  );
}
