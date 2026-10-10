"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";
import AdminDashboard from "../../features/admin/AdminDashboard";

export default function AdminPage() {
  const router = useRouter();
  return <AdminDashboard client={supabase} router={router} />;
}
