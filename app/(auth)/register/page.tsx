"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerUser } from "@/actions/register";
import Link from "next/link";
import { UserPlus, ArrowLeft } from "lucide-react";

export default function RegisterPage() {
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (formData: FormData) => {
        const res = await registerUser(formData);

        if (res.error) {
            setError(res.error);
        } else {
            router.push("/login");
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
                        <UserPlus className="w-6 h-6 text-emerald-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
                    <p className="text-sm text-muted-foreground">Enter your details to get started</p>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="email">Email</label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                required
                                className="bg-slate-950 border-slate-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="password">Create Password</label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="bg-slate-950 border-slate-800"
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                            Register
                        </Button>
                    </form>
                    <div className="mt-4 text-center text-sm">
                        <Link href="/login" className="text-emerald-500 hover:underline">
                            Already have an account? Login
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
