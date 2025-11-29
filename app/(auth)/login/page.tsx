"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [token, setToken] = useState("");
    const [showTwoFactor, setShowTwoFactor] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            const res = await login({
                email,
                password,
                token: showTwoFactor ? token : undefined,
            });

            if (res?.requires2FA) {
                setShowTwoFactor(true);
            } else if (res?.error) {
                setError(res.error);
            } else {
                router.refresh();
                router.push("/");
            }
        } catch (err) {
            setError("Something went wrong");
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 relative">
            <Link href="/" className="absolute top-4 left-4">
                <Button variant="ghost" className="text-slate-400 hover:text-white">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Button>
            </Link>
            <Card className="w-[350px] bg-slate-900 border-slate-800 text-slate-100">
                <CardHeader className="space-y-1 text-center">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-6 h-6 text-emerald-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
                    <p className="text-sm text-muted-foreground">Enter your credentials to access your account</p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!showTwoFactor && (
                            <>
                                <div className="space-y-2">
                                    <label htmlFor="email">Email</label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="bg-slate-950 border-slate-800"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="password">Password</label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="bg-slate-950 border-slate-800"
                                    />
                                </div>
                            </>
                        )}

                        {showTwoFactor && (
                            <div className="space-y-2">
                                <label htmlFor="token">2FA Code</label>
                                <Input
                                    id="token"
                                    type="text"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    required
                                    placeholder="123456"
                                    className="bg-slate-950 border-slate-800"
                                />
                            </div>
                        )}

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                            {showTwoFactor ? "Verify" : "Login"}
                        </Button>
                    </form>
                    <div className="mt-4 text-center text-sm">
                        <Link href="/register" className="text-emerald-500 hover:underline">
                            Don't have an account? Register
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
