"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Shield, Zap, Eye, Users, MessageSquare, ArrowRight, CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [userLimit, setUserLimit] = useState("10");
  const [password, setPassword] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const createRoom = async () => {
    if (!nickname.trim()) {
      alert("Please enter a nickname");
      return;
    }
    if (password) {
      sessionStorage.setItem("temp_room_password", password);
    }
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(`/room/${code}?nickname=${encodeURIComponent(nickname)}&limit=${userLimit}`);
  };

  const joinRoom = () => {
    if (!nickname.trim()) {
      alert("Please enter a nickname");
      return;
    }
    if (roomCode.trim()) {
      if (password) {
        sessionStorage.setItem("temp_room_password", password);
      }
      router.push(`/room/${roomCode.toUpperCase()}?nickname=${encodeURIComponent(nickname)}`);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden selection:bg-emerald-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Navbar */}
      <nav className="container mx-auto px-6 py-6 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Lock className="w-6 h-6 text-slate-950" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Secure Chat
            </span>
          </div>
          <div className="flex gap-4">
            {status === "authenticated" ? (
              <>
                <Link href="/settings">
                  <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Account Settings</Button>
                </Link>
                <Button
                  onClick={() => signOut()}
                  className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Login</Button>
                </Link>
                <Link href="/register">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 relative z-10">
        {/* Hero Content */}
        <div className="pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-8 animate-fade-in-up">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">End-to-End Encrypted</span>
          </div>

          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6 animate-fade-in-up leading-tight">
            End-to-End Encrypted Chat Room Web Application
          </h2>

          <h1 className="text-6xl md:text-7xl font-bold text-foreground mb-6 leading-tight tracking-tight animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            Private Conversations,
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Zero Traces
            </span>
          </h1>

          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Secure, ephemeral chat rooms with military-grade encryption.
            No registration, no history, no compromises.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Button
              onClick={() => setShowJoinModal(true)}
              className="h-14 px-8 text-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-105"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-24 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            {[
              { icon: Lock, title: "E2E Encryption", desc: "Every message encrypted with unique keys. Nobody can intercept your conversations." },
              { icon: Eye, title: "No Tracking", desc: "Zero data collection. No accounts required. Your privacy is absolute." },
              { icon: Zap, title: "Instant Setup", desc: "Create or join rooms in seconds. No downloads, no hassle." }
            ].map((feature, i) => (
              <Card key={i} className="glass-card border-white/5 hover:border-emerald-500/30 transition-all duration-300 group hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Features List */}
          <div className="max-w-4xl mx-auto mb-24">
            <h2 className="text-3xl font-bold text-foreground mb-12">
              Everything you need for secure communication
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              {[
                { icon: MessageSquare, title: "Real-time Messaging", desc: "Instant message delivery with read receipts" },
                { icon: Users, title: "Group Chats", desc: "Secure rooms for multiple participants" },
                { icon: Shield, title: "Perfect Forward Secrecy", desc: "New keys for every session" },
                { icon: CheckCircle2, title: "Typing Indicators", desc: "Know when others are responding" },
              ].map((feature, i) => (
                <div key={i} className="flex gap-4 items-start p-4 rounded-xl bg-card/30 border border-border/50 hover:bg-card/50 transition-colors">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 relative z-10 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>© 2025 Secure Chat. Secure by design.</p>
        </div>
      </footer>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowJoinModal(false)}>
          <Card className="w-full max-w-md bg-card border-border shadow-2xl animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="absolute right-4 top-4">
              <Button variant="ghost" size="icon" onClick={() => setShowJoinModal(false)} className="h-8 w-8 rounded-full hover:bg-muted">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <CardContent className="p-8 space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Join Chat Room</h2>
                <p className="text-muted-foreground text-sm">Enter a nickname to get started</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Your Nickname</label>
                  <Input
                    placeholder="Enter your display name"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="bg-muted/50 border-border focus:ring-emerald-500 h-11"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Room Password (Optional)</label>
                  <Input
                    type="password"
                    placeholder="Set a password for the room"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-muted/50 border-border focus:ring-emerald-500 h-11"
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <label className="text-sm font-medium text-foreground mb-2 block">Create Room</label>
                  <div className="flex gap-3">
                    <Input
                      type="number"
                      placeholder="Max"
                      value={userLimit}
                      onChange={(e) => setUserLimit(e.target.value)}
                      className="w-24 bg-muted/50 border-border focus:ring-emerald-500 h-11"
                      min={2}
                      max={50}
                    />
                    <Button
                      onClick={createRoom}
                      className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/20"
                    >
                      Create Room
                    </Button>
                  </div>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or join existing</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Join Room</label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter Room Code"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      className="bg-muted/50 border-border focus:ring-emerald-500 h-11"
                    />
                    <Button
                      onClick={joinRoom}
                      className="h-11 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    >
                      Join
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
