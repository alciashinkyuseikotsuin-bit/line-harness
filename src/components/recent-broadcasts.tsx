import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const broadcasts = [
  {
    id: 1,
    title: "3月キャンペーン告知",
    date: "2026-03-25",
    status: "sent",
    opens: "72.1%",
    clicks: "18.3%",
  },
  {
    id: 2,
    title: "新メニュー紹介",
    date: "2026-03-20",
    status: "sent",
    opens: "65.8%",
    clicks: "12.7%",
  },
  {
    id: 3,
    title: "リマインド配信",
    date: "2026-03-15",
    status: "sent",
    opens: "58.2%",
    clicks: "9.4%",
  },
  {
    id: 4,
    title: "4月予約受付開始",
    date: "2026-03-28",
    status: "scheduled",
    opens: "-",
    clicks: "-",
  },
];

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">最近の配信</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {broadcasts.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium">{b.title}</div>
                <div className="text-xs text-muted-foreground">{b.date}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-muted-foreground">
                  <div>開封 {b.opens}</div>
                  <div>クリック {b.clicks}</div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
