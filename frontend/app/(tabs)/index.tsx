import React from "react";

import { useAuth } from "@/src/context/AuthContext";
import CoachHome from "@/src/screens/CoachHome";
import ClientToday from "@/src/screens/ClientToday";

export default function HomeTab() {
  const { user } = useAuth();
  if (user?.role === "coach") return <CoachHome />;
  return <ClientToday />;
}
