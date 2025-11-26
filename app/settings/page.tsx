"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enableTwoFactor, confirmTwoFactor, disableTwoFactor, getTwoFactorStatus } from "@/actions/two-factor";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { Copy, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
    const { data: session } = useSession();
    const [isEnabled, setIsEnabled] = useState(false);
    const [qrCode, setQrCode] = useState("");
    const [secret, setSecret] = useState("");
    const [token, setToken] = useState("");
    const [step, setStep] = useState<"idle" | "verify">("idle");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        getTwoFactorStatus().then((res) => {
            if (res.isEnabled) setIsEnabled(true);
        });
    }, []);

    const handleEnable = async () => {
        const res = await enableTwoFactor();
        if (res.qrCodeUrl && res.secret) {
            setQrCode(res.qrCodeUrl);
            setSecret(res.secret);
            setStep("verify");
        }
    };

    const handleVerify = async () => {
        const res = await confirmTwoFactor(token);
        if (res.success) {
            setIsEnabled(true);
            setStep("idle");
            setQrCode("");
            setMsg("2FA Enabled Successfully!");
        } else {
            setMsg("Invalid Token");
        }
    };

    const handleDisable = async () => {
        await disableTwoFactor();
        setIsEnabled(false);
        setMsg("2FA Disabled");
    };

    if (!session) {
        // Redirect if not logged in
        // Ideally handled by middleware, but client-side check for now
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 relative">
            <Link href="/" className="absolute top-4 left-4">
                <Button variant="ghost" className="text-slate-400 hover:text-white">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Button>
            </Link>
            <Card className="w-[400px] bg-slate-900 border-slate-800 text-slate-100">
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span>Email:</span>
                        <span className="text-slate-400">{session.user?.email}</span>
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                        <h3 className="text-lg font-semibold mb-2">Two-Factor Authentication</h3>
                        {isEnabled ? (
                            <div className="space-y-2">
                                <p className="text-emerald-500">✅ Enabled</p>
                                <Button onClick={handleDisable} variant="destructive" className="w-full">
                                    Disable 2FA
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-slate-400">Secure your account with 2FA.</p>
                                {step === "idle" && (
                                    <Button onClick={handleEnable} className="w-full bg-emerald-600 hover:bg-emerald-700">
                                        Enable 2FA
                                    </Button>
                                )}
                            </div>
                        )}

                        {step === "verify" && qrCode && (
                            <div className="mt-4 space-y-4">
                                <div className="flex justify-center bg-white p-2 rounded">
                                    <Image src={qrCode} alt="QR Code" width={150} height={150} />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-xs text-slate-400">Scan with Google Authenticator</p>
                                    <p className="text-xs text-slate-500">Or enter this key manually:</p>
                                    <div className="flex items-center gap-2 justify-center">
                                        <code className="bg-slate-950 px-2 py-1 rounded text-xs font-mono text-emerald-500">{secret}</code>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => navigator.clipboard.writeText(secret)}
                                            title="Copy Key"
                                        >
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                                <Input
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="Enter 6-digit code"
                                    className="bg-slate-950 border-slate-800"
                                />
                                <Button onClick={handleVerify} className="w-full bg-emerald-600 hover:bg-emerald-700">
                                    Verify & Activate
                                </Button>
                            </div>
                        )}

                        {msg && <p className="text-center text-sm mt-2">{msg}</p>}
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                        <Button onClick={() => signOut()} variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">
                            Sign Out
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
