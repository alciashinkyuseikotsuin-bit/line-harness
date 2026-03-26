"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Broadcast = {
  id: string;
  title: string;
  sent_at: string | null;
  status: string;
  delivered_count: number;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700">
        配信済み
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
      予約中
    </Badge>
  );
}

export function RecentBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  useEffect(() => {
    fetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => setBroadcasts((d.broadcasts || []).slice(0, 5)))
      .catch(console.error);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">最近の配信</CardTitle>
      </CardHeader>
      <CardContent>
        {broadcasts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            配信履歴がありません
          </p>
        ) : (
          <div className="space-y-4">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium">{b.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.sent_at
                      ? new Date(b.sent_at).toLocaleDateString("ja-JP")
                      : "-"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <div>
                      配信数 {b.delivered_count?.toLocaleString() || 0}
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
