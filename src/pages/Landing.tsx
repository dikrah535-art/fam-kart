import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Users, Zap, Wallet } from "lucide-react";
import Logo from "@/components/Logo";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Users,
    title: "Shared lists",
    desc: "Every family member sees the same shopping list, always up to date.",
  },
  {
    icon: Zap,
    title: "Realtime sync",
    desc: "Add an item on your phone, see it appear on everyone's screen instantly.",
  },
  {
    icon: Wallet,
    title: "Family budget",
    desc: "Track every rupee spent across the household in one clean place.",
  },
];

export default function Landing() {
  return (
    <PageTransition>
      <div className="hero-gradient dot-grid min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <Logo size={26} />
          <div className="flex gap-2">
            <Link to="/login">
              <Button variant="ghost" className="text-white hover:bg-white/5">Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Get started
              </Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-white"
          >
            Your household,{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              perfectly in sync
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            FamKart is the shared shopping list, budget tracker, and family notebook
            built for Indian households.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-wrap gap-3 justify-center"
          >
            <Link to="/signup">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base">
                Create your family
              </Button>
            </Link>
            <Link to="/onboarding">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/15 text-white hover:bg-white/5">
                Join with code
              </Button>
            </Link>
          </motion.div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-24 pt-8">
          <div className="grid gap-5 md:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <f.icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
