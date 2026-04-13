"use client";

import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllDrivers, fetchUserDetails, Driver } from "@/lib/driverService";
import { fetchDashboardMetrics } from "@/lib/dashboardService";
import {
  MetricKind,
  MetricDriverDetail,
  DashboardMetrics,
} from "@/types/dashboard";
import MetricCard from "@/app/components/MetricCard";
import MetricLabel from "@/app/components/MetricLabel";
import MetricModal from "@/app/components/MetricModal";
import BulkExportModal from "@/app/components/BulkExportModal";
import AddUserModal from "@/app/components/AddUserModal";
import EditUserModal from "@/app/components/EditUserModal";
import { ArrowRight, Pencil, UserPlus } from "lucide-react";
import "./style.css";

const DRIVERS_PER_PAGE = 8;

/** Converts a Firestore duty status type string to a readable label. */
function formatStatusType(type: string): string {
  if (type === "on-duty-driving") return "On duty driving";
  if (type === "on-duty-not-driving") return "On duty not driving";
  return "Off duty";
}

interface ActiveModal {
  label: string;
  details: MetricDriverDetail[];
  kind: MetricKind;
}

export default function Dashboard() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [managerLocation, setManagerLocation] = useState<string | undefined>();

  const { user, userRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchAllDrivers().then((allDrivers) => {
      setDrivers(allDrivers);
      fetchDashboardMetrics(allDrivers)
        .then(setMetrics)
        .finally(() => setLoading(false));
    });
  }, []);

  // Fetch the manager's organization_location once so it can be passed to AddUserModal
  useEffect(() => {
    if (userRole === "manager" && user) {
      fetchUserDetails(user.uid).then((d) =>
        setManagerLocation(d?.organization_location),
      );
    }
  }, [user, userRole]);

  const filteredDrivers = drivers.filter((driver) =>
    driver.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const totalPages = Math.ceil(filteredDrivers.length / DRIVERS_PER_PAGE);
  const paginatedDrivers = filteredDrivers.slice(
    currentPage * DRIVERS_PER_PAGE,
    (currentPage + 1) * DRIVERS_PER_PAGE,
  );

  function handleDriverSelect(driver: Driver) {
    router.push(
      `/documents?driverId=${driver.id}&driverName=${encodeURIComponent(driver.name)}`,
    );
  }

  function openModal(
    label: string,
    kind: MetricKind,
    details: MetricDriverDetail[],
  ) {
    setActiveModal({ label, details, kind });
  }

  async function refreshDrivers() {
    const allDrivers = await fetchAllDrivers();
    setDrivers(allDrivers);
    fetchDashboardMetrics(allDrivers).then(setMetrics);
  }

  // Build metric definitions from the fetched metrics data
  const metricDefs: {
    label: string;
    value: string;
    sub?: string;
    lines?: string[];
    count: number;
    kind: MetricKind;
    details: MetricDriverDetail[];
    clickable: boolean;
  }[] = metrics
    ? [
        {
          label: "Earliest Activity This Week",
          value: metrics.earliestEventWeek?.driverName ?? "No data",
          sub: metrics.earliestEventWeek
            ? `${metrics.earliestEventWeek.date} at ${metrics.earliestEventWeek.time}`
            : undefined,
          lines: metrics.earliestEventWeek?.statuses[0]
            ? [formatStatusType(metrics.earliestEventWeek.statuses[0].type)]
            : undefined,
          count: 0,
          kind: "earliest",
          details: [],
          clickable: false,
        },
        {
          label: "Latest Activity This Week",
          value: metrics.latestEventWeek?.driverName ?? "No data",
          sub: metrics.latestEventWeek
            ? `${metrics.latestEventWeek.date} at ${metrics.latestEventWeek.time}`
            : undefined,
          lines: metrics.latestEventWeek?.statuses.at(-1)
            ? [formatStatusType(metrics.latestEventWeek.statuses.at(-1)!.type)]
            : undefined,
          count: 0,
          kind: "latest",
          details: [],
          clickable: false,
        },
        {
          label: "Offending Drivers",
          value:
            metrics.offendingDrivers.length > 0
              ? `${metrics.offendingDrivers.length} driver(s)`
              : "None",
          sub:
            metrics.offendingDrivers.length > 0
              ? "Exceeding on-duty or drive limits"
              : "All drivers within limits",
          count: metrics.offendingDrivers.length,
          kind: "offending",
          details: metrics.offendingDrivers,
          clickable: true,
        },
        {
          label: "Missing Hours of Service (Two Weeks)",
          value:
            metrics.missingHoSDrivers.length > 0
              ? `${metrics.missingHoSDrivers.length} driver(s)`
              : "None",
          sub:
            metrics.missingHoSDrivers.length > 0
              ? "Missing submissions in past two weeks"
              : "All submissions present",
          count: metrics.missingHoSDrivers.length,
          kind: "missing",
          details: metrics.missingHoSDrivers,
          clickable: true,
        },
      ]
    : [];

  return (
    <div className="flex h-[calc(100vh-72px)]">
      {/* ── Left half: paginated, searchable driver list ── */}
      <div className="w-1/2 flex flex-col gap-3 p-6 border-r border-gray-200">

        {/* Search bar + Add User icon (managers only) */}
        <div className="flex gap-2">
          <input
            className="p-3 border rounded-2xl flex-1"
            type="text"
            placeholder="Search for a driver..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
          />
          {userRole === "manager" && (
            <button
              title="Add user"
              onClick={() => setShowAddUser(true)}
              className="btn-action rounded-2xl px-3 shrink-0"
            >
              <UserPlus size={20} />
            </button>
          )}
        </div>

        <button
          className="btn-primary-action rounded-2xl"
          onClick={() => setShowBulkExport(true)}
        >
          Bulk Export Hours of Service
        </button>

        <div className="driver-list flex flex-col gap-3 flex-1">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading drivers...</p>
          ) : paginatedDrivers.length === 0 ? (
            <p className="text-gray-500 text-sm">No drivers found.</p>
          ) : (
            paginatedDrivers.map((driver) => (
              <div
                key={driver.id}
                className="card w-full text-left"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <p className="font-bold text-gray-800">
                    {driver.name}
                    {driver.id === user?.uid && (
                      <span className="badge-me">(Me)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {driver.role}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {userRole === "manager" && driver.id !== user?.uid && (
                    <button
                      title="Edit user"
                      onClick={() => setEditingDriver(driver)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  <button
                    title="View hours of service"
                    onClick={() => handleDriverSelect(driver)}
                    className="p-1 text-black hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    <ArrowRight size={30} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-2">
            <button
              className="btn-action"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              ←
            </button>
            <span className="text-sm text-gray-600">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              className="btn-action"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* ── Right half: 4 metrics in a diagonal card/label pattern ── */}
      <div
        className="w-1/2 flex items-center justify-center"
        style={{ height: "calc(100vh - 72px)" }}
      >
        <div className="grid grid-cols-2 grid-rows-4 gap-3 w-4/5 h-full">
          {metricDefs.map((metric, index) => {
            const handleOpen = metric.clickable
              ? () => openModal(metric.label, metric.kind, metric.details)
              : undefined;

            const card = (
              <MetricCard
                value={metric.value}
                sub={metric.sub}
                lines={metric.lines}
                count={metric.count}
                onClick={handleOpen}
              />
            );
            const label = <MetricLabel label={metric.label} />;

            return index % 2 === 0 ? (
              <Fragment key={metric.label}>
                {card}
                {label}
              </Fragment>
            ) : (
              <Fragment key={metric.label}>
                {label}
                {card}
              </Fragment>
            );
          })}
        </div>
      </div>

      {activeModal && (
        <MetricModal
          label={activeModal.label}
          details={activeModal.details}
          kind={activeModal.kind}
          onClose={() => setActiveModal(null)}
        />
      )}

      {showBulkExport && (
        <BulkExportModal
          drivers={drivers}
          metrics={metrics}
          onClose={() => setShowBulkExport(false)}
        />
      )}

      {showAddUser && (
        <AddUserModal
          managerLocation={managerLocation}
          onClose={() => setShowAddUser(false)}
          onCreated={async () => {
            setShowAddUser(false);
            await refreshDrivers();
          }}
        />
      )}

      {editingDriver && (
        <EditUserModal
          driver={editingDriver}
          onClose={() => setEditingDriver(null)}
          onSaved={async () => {
            setEditingDriver(null);
            await refreshDrivers();
          }}
          onDeleted={async () => {
            setEditingDriver(null);
            await refreshDrivers();
          }}
        />
      )}
    </div>
  );
}
