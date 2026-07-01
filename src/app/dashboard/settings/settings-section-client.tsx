"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CowLoading from "@/components/cow-loading";
import DashboardShell from "@/components/dashboard-shell";
import { withBasePath } from "@/lib/app-path";
import styles from "./page.module.css";

type SettingsSection = "farm" | "users" | "documents";

type SettingsSummary = {
  farmCount: number;
  paddockCount: number;
  assetCount: number;
  animalCount: number;
  userCount: number;
  activeUserCount: number;
  roleCount: number;
  inviteCount: number;
  pendingInviteCount: number;
  documentCount: number;
  pendingDocumentCount: number;
  expiringDocumentCount: number;
  currentRoleName: string | null;
  canWriteFarm?: boolean;
  canManageSettings?: boolean;
  canManageUsers?: boolean;
  canManageDocuments?: boolean;
};

type SettingsStandardUnits = {
  animal_load?: string | null;
  area?: string | null;
  length?: string | null;
  mass?: string | null;
  spring?: string | null;
  temperature?: string | null;
  preferred_units?: string | null;
  volume?: string | null;
};

type SettingsUserAccount = {
  member_id: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  language?: string | null;
  status?: string | null;
  joined_at?: string | null;
  base_role?: string | null;
  farm_role?: string | null;
  role_code?: string | null;
  role_name?: string | null;
  role_permissions?: Record<string, unknown>;
  invite_status?: string | null;
  invite_accepted?: boolean;
  is_invite?: boolean;
  is_owner?: boolean;
  is_current_user?: boolean;
};

type SettingsDocument = {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  number?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  status?: string | null;
  file_url?: string | null;
  note?: string | null;
  is_shared?: boolean;
  file_name?: string | null;
  file_type?: string | null;
  created_at?: string | null;
};

type Profile = {
  owner_id?: string;
  full_name?: string | null;
  email?: string | null;
  farm_id?: string | null;
  farm_code?: string | null;
  farm_name?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  state?: string | null;
  country?: string | null;
  farm_area_hectare?: number | null;
  special_factors?: string | null;
  other_activity?: string | null;
  annual_rainfall?: number | null;
  carrying_capacity?: number | null;
  spring_start?: string | null;
  location_name?: string | null;
  maps_link?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_map_shared?: boolean;
  standard_units?: SettingsStandardUnits;
  users?: SettingsUserAccount[];
  documents?: SettingsDocument[];
  settings_summary?: SettingsSummary;
};

type FarmForm = {
  farm_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postal_code: string;
  state: string;
  country: string;
  farm_area_hectare: string;
  location_name: string;
  maps_link: string;
  latitude: string;
  longitude: string;
  special_factors: string;
  spring_start: string;
  standard_units: Required<SettingsStandardUnits>;
};

type RoleCode = "none" | "viewer" | "editor" | "admin";
type DisplayRoleCode = RoleCode | "owner";

type AddUserForm = {
  first_name: string;
  last_name: string;
  language: string;
  account_enabled: boolean;
  phone_country: string;
  phone_number: string;
  email: string;
  base_role: RoleCode;
  farm_role: RoleCode;
};

type EditUserForm = AddUserForm & {
  member_id: string;
  user_id: string;
  status: "active" | "disabled";
};

type DocumentForm = {
  name: string;
  type: string;
  number: string;
  issued_at: string;
  expires_at: string;
  note: string;
  is_shared: boolean;
  file: File | null;
};

type ContactCheckResponse = {
  available?: boolean;
  message?: string;
  fields?: {
    email?: string;
    phone?: string;
  };
};

type IconName = "settings" | "farm" | "users" | "userAdd" | "document" | "map" | "back" | "check" | "lock" | "edit" | "trash" | "save" | "close";

const EMPTY_FORM: FarmForm = {
  farm_name: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  postal_code: "",
  state: "",
  country: "",
  farm_area_hectare: "",
  location_name: "",
  maps_link: "",
  latitude: "",
  longitude: "",
  special_factors: "",
  spring_start: "",
  standard_units: {
    animal_load: "DSE",
    area: "Hectare",
    length: "Metric",
    mass: "Metric",
    spring: "1-Sep",
    temperature: "Celsius",
    preferred_units: "Metric",
    volume: "Metric",
  },
};

const EMPTY_ADD_USER_FORM: AddUserForm = {
  first_name: "",
  last_name: "",
  language: "vi-VN",
  account_enabled: true,
  phone_country: "+84",
  phone_number: "",
  email: "",
  base_role: "none",
  farm_role: "none",
};

const EMPTY_EDIT_USER_FORM: EditUserForm = {
  ...EMPTY_ADD_USER_FORM,
  member_id: "",
  user_id: "",
  status: "active",
};

const EMPTY_DOCUMENT_FORM: DocumentForm = {
  name: "",
  type: "giay_kiem_nghiem",
  number: "",
  issued_at: "",
  expires_at: "",
  note: "",
  is_shared: false,
  file: null,
};

const ADD_USER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DOCUMENT_TYPE_OPTIONS = [
  { value: "giay_kiem_nghiem", label: "Giấy kiểm nghiệm" },
  { value: "giay_phep_kinh_doanh", label: "Giấy phép kinh doanh" },
  { value: "bang_khen", label: "Bằng khen" },
  { value: "giay_kiem_dinh", label: "Giấy kiểm định" },
  { value: "ban_anh", label: "Bản ảnh" },
  { value: "ban_dien_tu", label: "Bản điện tử" },
  { value: "khac", label: "Chứng từ khác" },
];

const ROLE_LABELS: Record<DisplayRoleCode, string> = {
  none: "Không có quyền",
  viewer: "Chỉ xem",
  editor: "Biên tập",
  admin: "Quản trị",
  owner: "Chủ sở hữu",
};

const TABS: Array<{ section: SettingsSection; href: string; label: string }> = [
  { section: "farm", href: "/dashboard/settings/thong-tin-trang-trai", label: "Thông tin trang trại" },
  { section: "users", href: "/dashboard/settings/nguoi-dung", label: "Người dùng & phân quyền" },
  { section: "documents", href: "/dashboard/settings/chung-tu", label: "Chứng từ" },
];

const UNIT_FIELDS: Array<{ key: keyof SettingsStandardUnits; label: string }> = [
  { key: "animal_load", label: "Tải vật nuôi" },
  { key: "area", label: "Diện tích" },
  { key: "length", label: "Chiều dài" },
  { key: "mass", label: "Khối lượng" },
  { key: "spring", label: "Mùa xuân" },
  { key: "temperature", label: "Nhiệt độ" },
  { key: "preferred_units", label: "Đơn vị ưu tiên" },
  { key: "volume", label: "Thể tích" },
];

const UNIT_VALUE_LABELS: Record<string, string> = {
  dse: "DSE",
  hectare: "Héc-ta",
  metric: "Hệ mét",
  celsius: "Độ C",
  "1-sep": "01/09",
};

const UNIT_OPTIONS: Record<keyof Required<SettingsStandardUnits>, Array<{ value: string; label: string }>> = {
  animal_load: [{ value: "DSE", label: "DSE" }],
  area: [{ value: "Hectare", label: "Héc-ta" }],
  length: [{ value: "Metric", label: "Hệ mét" }],
  mass: [{ value: "Metric", label: "Hệ mét" }],
  spring: [{ value: "1-Sep", label: "01/09" }],
  temperature: [{ value: "Celsius", label: "Độ C" }],
  preferred_units: [{ value: "Metric", label: "Hệ mét" }],
  volume: [{ value: "Metric", label: "Hệ mét" }],
};

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.2 2.2 0 0 1-3.11 3.11l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2.2 2.2 0 1 1-4.4 0v-.06A1.8 1.8 0 0 0 8.06 19.3a1.8 1.8 0 0 0-1.98.36l-.04.04a2.2 2.2 0 0 1-3.11-3.11l.04-.04a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.65-1.1H1.6a2.2 2.2 0 1 1 0-4.4h.06A1.8 1.8 0 0 0 3.3 8.06a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.2 2.2 0 0 1 3.11-3.11l.04.04a1.8 1.8 0 0 0 1.98.36H8.1A1.8 1.8 0 0 0 9.2 1.68V1.6a2.2 2.2 0 1 1 4.4 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.2 2.2 0 0 1 3.11 3.11l-.04.04a1.8 1.8 0 0 0-.36 1.98v.07a1.8 1.8 0 0 0 1.65 1.1h.06a2.2 2.2 0 1 1 0 4.4h-.06A1.8 1.8 0 0 0 19.4 15Z" />
        </svg>
      );
    case "farm":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M8 20v-7h8v7" />
          <path d="M9 9h6" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "userAdd":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "document":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case "back":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      );
    case "save":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M17 21v-8H7v8" />
          <path d="M7 3v5h8" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case "check":
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m20 6-11 11-5-5" />
        </svg>
      );
  }
}

function valueOrEmpty(value: string | number | null | undefined, fallback = "Chưa cập nhật") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function displayUnitValue(value: string | null | undefined) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return "Chưa cập nhật";
  return UNIT_VALUE_LABELS[cleanValue.toLowerCase()] ?? cleanValue;
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "0";
  return `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}${suffix}`;
}

function formatCoordinate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(6);
}

function parseOptionalNumber(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return null;
  const numberValue = Number(cleanValue);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function displayStatus(value: string | null | undefined) {
  const cleanValue = String(value ?? "").trim().toLowerCase();
  if (cleanValue === "active") return "Đang hoạt động";
  if (cleanValue === "pending") return "Đang chờ";
  if (cleanValue === "declined" || cleanValue === "rejected") return "Đã từ chối";
  if (cleanValue === "expired") return "Đã hết hạn";
  if (cleanValue === "inactive") return "Tạm khóa";
  if (cleanValue === "disabled") return "Đã khóa";
  return cleanValue ? valueOrEmpty(value) : "Chưa cập nhật";
}

function displayRoleName(value: string | null | undefined) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return "Chưa phân quyền";
  const roleCode = cleanValue.toLowerCase() as DisplayRoleCode;
  if (roleCode in ROLE_LABELS) return ROLE_LABELS[roleCode];
  if (cleanValue.toLowerCase() === "chủ trang trại") return ROLE_LABELS.owner;
  if (cleanValue.toLowerCase() === "owner") return ROLE_LABELS.owner;
  return cleanValue;
}

function displayInviteStatus(value: string | null | undefined, accepted?: boolean) {
  if (accepted) return "Đã chấp nhận";
  const cleanValue = String(value ?? "").trim().toLowerCase();
  if (cleanValue === "pending") return "Chưa giải quyết";
  if (cleanValue === "accepted") return "Đã chấp nhận";
  if (cleanValue === "declined" || cleanValue === "rejected") return "Đã từ chối";
  if (cleanValue === "expired") return "Đã hết hạn";
  if (cleanValue === "revoked" || cleanValue === "cancelled") return "Đã hủy";
  return cleanValue ? valueOrEmpty(value) : "Chưa giải quyết";
}

function displayDocumentType(value: string | null | undefined) {
  const cleanValue = String(value ?? "").trim();
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === cleanValue)?.label ?? valueOrEmpty(cleanValue, "Chứng từ");
}

function formatDateValue(value: string | null | undefined) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function displayUserName(user: SettingsUserAccount) {
  return valueOrEmpty(user.full_name ?? user.email, "Người dùng chưa đặt tên");
}

function displayUserCode(index: number) {
  return `ID ${index + 1}`;
}

function buildAddUserPhone(form: AddUserForm) {
  const phoneNumber = form.phone_number.trim();
  return phoneNumber ? [form.phone_country.trim(), phoneNumber].filter(Boolean).join(" ") : "";
}

function splitFullName(value: string | null | undefined) {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function splitPhone(value: string | null | undefined) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return { country: "+84", number: "" };
  const match = cleanValue.match(/^(\+\d{1,3})\s*(.*)$/);
  if (!match) return { country: "+84", number: cleanValue };
  return { country: match[1], number: match[2] ?? "" };
}

function userToEditForm(user: SettingsUserAccount): EditUserForm {
  const name = splitFullName(user.full_name ?? user.email);
  const phone = splitPhone(user.phone);
  const roleCode = (user.role_code?.toLowerCase() ?? "none") as RoleCode;
  const baseRole = normalizeEditableRole(user.base_role ?? roleCode);
  const farmRole = normalizeEditableRole(user.farm_role ?? roleCode);

  return {
    member_id: user.member_id,
    user_id: user.user_id,
    first_name: name.firstName,
    last_name: name.lastName,
    language: user.language || "vi-VN",
    account_enabled: String(user.status ?? "active").toLowerCase() !== "disabled",
    phone_country: phone.country,
    phone_number: phone.number,
    email: user.email ?? "",
    base_role: baseRole,
    farm_role: farmRole,
    status: String(user.status ?? "active").toLowerCase() === "disabled" ? "disabled" : "active",
  };
}

function normalizeEditableRole(value: string | null | undefined): RoleCode {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "viewer" || role === "editor" || role === "admin" ? role : "none";
}

function profileToFarmForm(profile: Profile): FarmForm {
  return {
    farm_name: profile.farm_name ?? "",
    address_line_1: profile.address_line_1 ?? profile.location_name ?? "",
    address_line_2: profile.address_line_2 ?? "",
    city: profile.city ?? "",
    postal_code: profile.postal_code ?? "",
    state: profile.state ?? "",
    country: profile.country ?? "",
    farm_area_hectare: profile.farm_area_hectare === null || profile.farm_area_hectare === undefined ? "" : String(profile.farm_area_hectare),
    location_name: profile.location_name ?? "",
    maps_link: profile.maps_link ?? "",
    latitude: profile.latitude === null || profile.latitude === undefined ? "" : String(profile.latitude),
    longitude: profile.longitude === null || profile.longitude === undefined ? "" : String(profile.longitude),
    special_factors: profile.special_factors ?? "",
    spring_start: profile.spring_start ?? "",
    standard_units: {
      animal_load: profile.standard_units?.animal_load ?? EMPTY_FORM.standard_units.animal_load,
      area: profile.standard_units?.area ?? EMPTY_FORM.standard_units.area,
      length: profile.standard_units?.length ?? EMPTY_FORM.standard_units.length,
      mass: profile.standard_units?.mass ?? EMPTY_FORM.standard_units.mass,
      spring: profile.standard_units?.spring ?? profile.spring_start ?? EMPTY_FORM.standard_units.spring,
      temperature: profile.standard_units?.temperature ?? EMPTY_FORM.standard_units.temperature,
      preferred_units: profile.standard_units?.preferred_units ?? EMPTY_FORM.standard_units.preferred_units,
      volume: profile.standard_units?.volume ?? EMPTY_FORM.standard_units.volume,
    },
  };
}

export default function SettingsSectionClient({ section }: { section: SettingsSection }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({});
  const [farmForm, setFarmForm] = useState<FarmForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [editingFarm, setEditingFarm] = useState(false);
  const [editStep, setEditStep] = useState<1 | 2 | 3>(1);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [deletingFarm, setDeletingFarm] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmFarmDeletion, setConfirmFarmDeletion] = useState(false);
  const [confirmAccountDeletion, setConfirmAccountDeletion] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [checkingAddUserContact, setCheckingAddUserContact] = useState(false);
  const [addUserContactError, setAddUserContactError] = useState("");
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addUserStep, setAddUserStep] = useState<1 | 2 | 3>(1);
  const [addUserForm, setAddUserForm] = useState<AddUserForm>(EMPTY_ADD_USER_FORM);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editUserStep, setEditUserStep] = useState<1 | 2 | 3>(1);
  const [editUserForm, setEditUserForm] = useState<EditUserForm>(EMPTY_EDIT_USER_FORM);
  const [editingUser, setEditingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [deleteUserModalOpen, setDeleteUserModalOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<SettingsUserAccount | null>(null);
  const [confirmUserDeletion, setConfirmUserDeletion] = useState(false);
  const [documentCreateModalOpen, setDocumentCreateModalOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState<DocumentForm>(EMPTY_DOCUMENT_FORM);
  const [savingDocument, setSavingDocument] = useState(false);
  const [sharingDocumentId, setSharingDocumentId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    fetch("/api/profile")
      .then((response) => {
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return null;
        }
        return response.json();
      })
      .then((data) => {
        if (alive && data) setProfile(data.profile ?? {});
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!editingFarm) setFarmForm(profileToFarmForm(profile));
  }, [editingFarm, profile]);

  const farmName = profile.farm_name || "Trang trại";
  const summary = profile.settings_summary;
  const userAccounts: SettingsUserAccount[] = profile.users?.length
    ? profile.users
    : profile.owner_id
      ? [
          {
            member_id: "current",
            user_id: profile.owner_id,
            full_name: profile.full_name,
            email: profile.email,
            avatar_url: null,
            phone: null,
            language: null,
            status: "active",
            joined_at: null,
            base_role: "admin",
            farm_role: "admin",
            role_code: null,
            role_name: summary?.currentRoleName,
            role_permissions: {},
            invite_status: "accepted",
            invite_accepted: true,
            is_invite: false,
            is_owner: true,
            is_current_user: true,
          },
        ]
      : [];
  const farmCount = summary?.farmCount ?? (profile.farm_id ? 1 : 0);
  const deletingFinalFarm = farmCount <= 1;
  const canWriteFarm = summary?.canWriteFarm === true;
  const canManageSettings = summary?.canManageSettings === true;
  const canManageUsers = summary?.canManageUsers === true;
  const canManageDocuments = summary?.canManageDocuments === true;
  const hasCurrentUserAccount = userAccounts.some((user) => user.is_current_user);
  const availableTabs = TABS.filter((tab) => {
    if (tab.section === "farm") return canManageSettings;
    if (tab.section === "users") return canManageUsers || hasCurrentUserAccount;
    if (tab.section === "documents") return canManageDocuments;
    return false;
  });
  const canDeleteFarm = confirmFarmDeletion && (!deletingFinalFarm || confirmAccountDeletion);
  const effectiveAddUserRole = addUserForm.farm_role !== "none" ? addUserForm.farm_role : addUserForm.base_role;
  const canSaveUser =
    Boolean(profile.farm_id) &&
    canManageUsers &&
    ADD_USER_EMAIL_PATTERN.test(addUserForm.email.trim()) &&
    effectiveAddUserRole !== "none" &&
    !addUserContactError &&
    !checkingAddUserContact &&
    !addingUser;
  const effectiveEditUserRole = editUserForm.farm_role !== "none" ? editUserForm.farm_role : editUserForm.base_role;
  const editingSelf = Boolean(editUserForm.user_id && profile.owner_id && editUserForm.user_id === profile.owner_id);
  const canSaveEditedUser =
    Boolean(profile.farm_id) &&
    (canManageUsers || editingSelf) &&
    Boolean(editUserForm.member_id) &&
    (editingSelf || effectiveEditUserRole !== "none") &&
    !editingUser;
  const activeTab = availableTabs.find((tab) => tab.section === section) ?? availableTabs[0] ?? TABS[0];
  const farmCode = profile.farm_code || (profile.farm_id ? profile.farm_id.slice(0, 8).toUpperCase() : "N/A");
  const coordinates = `${formatCoordinate(profile.latitude)}, ${formatCoordinate(profile.longitude)}`;
  const standardUnits = UNIT_FIELDS.map((unit) => ({
    label: unit.label,
    value: profile.standard_units?.[unit.key],
  }));
  const pageMeta = useMemo(() => {
    if (section === "users") {
      return {
        icon: "users" as const,
        title: "Người dùng và phân quyền",
        description: "Quản lý tài khoản trong trang trại, vai trò truy cập và lời mời thành viên.",
      };
    }
    if (section === "documents") {
      return {
        icon: "document" as const,
        title: "Chứng từ trang trại",
        description: "Quản lý giấy tờ trang trại, hồ sơ pháp lý và các chứng từ cần theo dõi hạn.",
      };
    }
    return {
      icon: "farm" as const,
      title: "Thông tin trang trại",
      description: "Cấu hình thông tin nền tảng, vị trí, diện tích và trạng thái chia sẻ trang trại.",
    };
  }, [section]);

  const updateFarmForm = (field: keyof FarmForm, value: string) => {
    setFarmForm((current) => ({ ...current, [field]: value }));
  };

  const updateUnitForm = (field: keyof Required<SettingsStandardUnits>, value: string) => {
    setFarmForm((current) => ({ ...current, standard_units: { ...current.standard_units, [field]: value } }));
  };

  const updateAddUserForm = <K extends keyof AddUserForm>(field: K, value: AddUserForm[K]) => {
    if (field === "email" || field === "phone_country" || field === "phone_number") {
      setAddUserContactError("");
    }
    setAddUserForm((current) => ({ ...current, [field]: value }));
  };

  const updateEditUserForm = <K extends keyof EditUserForm>(field: K, value: EditUserForm[K]) => {
    setEditUserForm((current) => ({ ...current, [field]: value }));
  };

  const updateDocumentForm = <K extends keyof DocumentForm>(field: K, value: DocumentForm[K]) => {
    setDocumentForm((current) => ({ ...current, [field]: value }));
  };

  const openFarmEditor = () => {
    if (!canWriteFarm) return;
    setFarmForm(profileToFarmForm(profile));
    setEditStep(1);
    setMessage("");
    setEditingFarm(true);
  };

  const openDeleteModal = () => {
    if (!profile.farm_id || deletingFarm || !canWriteFarm) return;
    setConfirmFarmDeletion(false);
    setConfirmAccountDeletion(false);
    setMessage("");
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deletingFarm) return;
    setDeleteModalOpen(false);
    setConfirmFarmDeletion(false);
    setConfirmAccountDeletion(false);
  };

  const openAddUserModal = () => {
    if (!profile.farm_id || addingUser || !canManageUsers) return;
    setAddUserForm(EMPTY_ADD_USER_FORM);
    setAddUserStep(1);
    setAddUserContactError("");
    setCheckingAddUserContact(false);
    setMessage("");
    setAddUserModalOpen(true);
  };

  const closeAddUserModal = () => {
    if (addingUser) return;
    setAddUserModalOpen(false);
    setAddUserForm(EMPTY_ADD_USER_FORM);
    setAddUserStep(1);
    setAddUserContactError("");
    setCheckingAddUserContact(false);
  };

  const openEditUserModal = (user: SettingsUserAccount) => {
    const canEditTarget = canManageUsers || user.is_current_user;
    if (!profile.farm_id || !canEditTarget || user.is_invite || (user.is_owner && !user.is_current_user)) return;
    setEditUserForm(userToEditForm(user));
    setEditUserStep(1);
    setMessage("");
    setEditUserModalOpen(true);
  };

  const closeEditUserModal = () => {
    if (editingUser) return;
    setEditUserModalOpen(false);
    setEditUserStep(1);
    setEditUserForm(EMPTY_EDIT_USER_FORM);
  };

  const openDeleteUserModal = (user: SettingsUserAccount) => {
    if (!profile.farm_id || deletingUserId || !canManageUsers || user.is_owner || user.is_current_user) return;
    setDeleteUserTarget(user);
    setConfirmUserDeletion(false);
    setMessage("");
    setDeleteUserModalOpen(true);
  };

  const closeDeleteUserModal = () => {
    if (deletingUserId) return;
    setDeleteUserModalOpen(false);
    setDeleteUserTarget(null);
    setConfirmUserDeletion(false);
  };

  const openDocumentCreateModal = () => {
    if (!profile.farm_id || !canManageDocuments || savingDocument) return;
    setDocumentForm(EMPTY_DOCUMENT_FORM);
    setMessage("");
    setDocumentCreateModalOpen(true);
  };

  const closeDocumentCreateModal = () => {
    if (savingDocument) return;
    setDocumentCreateModalOpen(false);
    setDocumentForm(EMPTY_DOCUMENT_FORM);
  };

  const checkAddUserContact = useCallback(
    async ({ signal, requireEmail = false }: { signal?: AbortSignal; requireEmail?: boolean } = {}) => {
      if (!profile.farm_id) {
        setAddUserContactError("Không tìm thấy trang trại để kiểm tra liên hệ.");
        return false;
      }

      const email = addUserForm.email.trim();
      const phoneNumber = addUserForm.phone_number.trim();
      const phone = phoneNumber ? [addUserForm.phone_country.trim(), phoneNumber].filter(Boolean).join(" ") : "";
      if (requireEmail && !email) {
        setAddUserContactError("Vui lòng nhập email trước khi tiếp tục.");
        return false;
      }
      if (email && !ADD_USER_EMAIL_PATTERN.test(email)) {
        setAddUserContactError("Email không hợp lệ.");
        return false;
      }
      if (!email && !phone) {
        setAddUserContactError("");
        return !requireEmail;
      }

      setCheckingAddUserContact(true);
      try {
        const response = await fetch("/api/settings/users/check-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ farm_id: profile.farm_id, email, phone }),
          signal,
        });
        const data = (await response.json()) as ContactCheckResponse;
        if (!response.ok || data.available === false) {
          const errorMessage = data.fields?.email || data.fields?.phone || data.message || "Thông tin liên hệ đã tồn tại trong hệ thống.";
          setAddUserContactError(errorMessage);
          return false;
        }

        setAddUserContactError("");
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return false;
        setAddUserContactError(error instanceof Error ? error.message : "Không thể kiểm tra thông tin liên hệ.");
        return false;
      } finally {
        setCheckingAddUserContact(false);
      }
    },
    [addUserForm.email, addUserForm.phone_country, addUserForm.phone_number, profile.farm_id]
  );

  const continueFromAddUserContact = async () => {
    if (checkingAddUserContact) return;
    const available = await checkAddUserContact({ requireEmail: true });
    if (available) setAddUserStep(3);
  };

  useEffect(() => {
    if (!addUserModalOpen || addUserStep !== 2 || !profile.farm_id) return;

    const email = addUserForm.email.trim();
    const phoneNumber = addUserForm.phone_number.trim();
    const phone = phoneNumber ? [addUserForm.phone_country.trim(), phoneNumber].filter(Boolean).join(" ") : "";
    if (!email && !phone) {
      setAddUserContactError("");
      setCheckingAddUserContact(false);
      return;
    }

    if (email && !ADD_USER_EMAIL_PATTERN.test(email)) {
      setAddUserContactError("Email không hợp lệ.");
      setCheckingAddUserContact(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void checkAddUserContact({ signal: controller.signal });
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    addUserForm.email,
    addUserForm.phone_country,
    addUserForm.phone_number,
    addUserModalOpen,
    addUserStep,
    checkAddUserContact,
    profile.farm_id,
  ]);

  const toggleSharing = async () => {
    if (!profile.farm_id || savingShare) return;
    const nextValue = !profile.is_map_shared;
    setSavingShare(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, is_map_shared: nextValue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể cập nhật trạng thái chia sẻ.");
      setProfile(data.profile ?? { ...profile, is_map_shared: nextValue });
      setMessage(nextValue ? "Đã bật chia sẻ trang trại." : "Đã tắt chia sẻ trang trại.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật trạng thái chia sẻ.");
    } finally {
      setSavingShare(false);
    }
  };

  const saveFarmProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          farm_name: farmForm.farm_name.trim(),
          address_line_1: farmForm.address_line_1.trim(),
          address_line_2: farmForm.address_line_2.trim(),
          city: farmForm.city.trim(),
          postal_code: farmForm.postal_code.trim(),
          state: farmForm.state.trim(),
          country: farmForm.country.trim(),
          farm_area_hectare: parseOptionalNumber(farmForm.farm_area_hectare),
          location_name: farmForm.address_line_1.trim(),
          maps_link: farmForm.maps_link.trim(),
          latitude: parseOptionalNumber(farmForm.latitude),
          longitude: parseOptionalNumber(farmForm.longitude),
          special_factors: farmForm.special_factors.trim(),
          spring_start: farmForm.standard_units.spring,
          standard_units: farmForm.standard_units,
          is_map_shared: Boolean(profile.is_map_shared),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể cập nhật thông tin trang trại.");
      setProfile(data.profile ?? profile);
      setEditingFarm(false);
      setEditStep(1);
      setMessage("Đã cập nhật thông tin trang trại.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật thông tin trang trại.");
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteFarm = async () => {
    if (!profile.farm_id || deletingFarm) return;
    if (!canDeleteFarm) {
      setMessage("Vui lòng xác nhận đầy đủ trước khi xóa.");
      return;
    }

    setDeletingFarm(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: profile.farm_id,
          confirm_farm_deletion: confirmFarmDeletion,
          confirm_account_deletion: deletingFinalFarm ? confirmAccountDeletion : false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể xóa trang trại.");

      if (data.deletedAccount) {
        setMessage("Đã xóa tài khoản và trang trại. Bạn sẽ được chuyển về trang đăng nhập.");
        window.location.href = withBasePath("/login");
        return;
      }

      setProfile(data.profile ?? {});
      setEditingFarm(false);
      setDeleteModalOpen(false);
      setConfirmFarmDeletion(false);
      setConfirmAccountDeletion(false);
      setMessage("Đã xóa trang trại.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xóa trang trại.");
    } finally {
      setDeletingFarm(false);
    }
  };

  const saveAddUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSaveUser || !profile.farm_id) {
      setMessage("Vui lòng nhập email và chọn vai trò trước khi lưu.");
      return;
    }

    setAddingUser(true);
    setMessage("");

    try {
      const phone = buildAddUserPhone(addUserForm);
      const response = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: profile.farm_id,
          first_name: addUserForm.first_name.trim(),
          last_name: addUserForm.last_name.trim(),
          language: addUserForm.language,
          account_enabled: addUserForm.account_enabled,
          phone,
          email: addUserForm.email.trim(),
          base_role: addUserForm.base_role,
          farm_role: addUserForm.farm_role,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể thêm người dùng.");

      setProfile(data.profile ?? profile);
      setAddUserModalOpen(false);
      setAddUserForm(EMPTY_ADD_USER_FORM);
      setAddUserStep(1);
      setAddUserContactError("");
      setCheckingAddUserContact(false);
      setMessage(data.message || "Đã thêm người dùng, phân quyền và gửi email lời mời.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể thêm người dùng.");
    } finally {
      setAddingUser(false);
    }
  };

  const saveEditUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSaveEditedUser || !profile.farm_id) {
      setMessage("Vui lòng nhập email và chọn vai trò trước khi lưu.");
      return;
    }

    setEditingUser(true);
    setMessage("");

    try {
      const response = await fetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: profile.farm_id,
          member_id: editUserForm.member_id,
          user_id: editUserForm.user_id,
          first_name: editUserForm.first_name.trim(),
          last_name: editUserForm.last_name.trim(),
          language: editUserForm.language,
          status: editUserForm.status,
          account_enabled: editUserForm.status === "active",
          base_role: editUserForm.base_role,
          farm_role: editUserForm.farm_role,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể cập nhật người dùng.");

      setProfile(data.profile ?? profile);
      setEditUserModalOpen(false);
      setEditUserStep(1);
      setEditUserForm(EMPTY_EDIT_USER_FORM);
      setMessage(data.message || "Đã cập nhật người dùng và phân quyền.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật người dùng.");
    } finally {
      setEditingUser(false);
    }
  };

  const deleteUser = async () => {
    const user = deleteUserTarget;
    if (!profile.farm_id || !user || deletingUserId || !canManageUsers || user.is_owner || user.is_current_user) return;
    if (!confirmUserDeletion) {
      setMessage("Vui lòng đánh dấu xác nhận trước khi xóa người dùng.");
      return;
    }

    setDeletingUserId(user.member_id);
    setMessage("");
    try {
      const response = await fetch("/api/settings/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: profile.farm_id,
          member_id: user.member_id,
          user_id: user.user_id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể xóa người dùng.");

      setProfile(data.profile ?? profile);
      setDeleteUserModalOpen(false);
      setDeleteUserTarget(null);
      setConfirmUserDeletion(false);
      setMessage(data.message || "Đã xóa quyền truy cập của người dùng.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xóa người dùng.");
    } finally {
      setDeletingUserId("");
    }
  };

  const saveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile.farm_id || !canManageDocuments || savingDocument) return;
    if (!documentForm.name.trim()) {
      setMessage("Vui lòng nhập tên chứng từ.");
      return;
    }
    if (!documentForm.file) {
      setMessage("Vui lòng chọn ảnh chứng từ để tải lên.");
      return;
    }

    setSavingDocument(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("farm_id", profile.farm_id);
      body.set("name", documentForm.name.trim());
      body.set("type", documentForm.type);
      body.set("number", documentForm.number.trim());
      body.set("issued_at", documentForm.issued_at);
      body.set("expires_at", documentForm.expires_at);
      body.set("note", documentForm.note.trim());
      body.set("is_shared", String(documentForm.is_shared));
      body.set("file", documentForm.file);

      const response = await fetch("/api/settings/documents", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể tải lên chứng từ.");

      setProfile(data.profile ?? profile);
      setDocumentForm(EMPTY_DOCUMENT_FORM);
      setDocumentCreateModalOpen(false);
      setMessage(data.message || "Đã tải lên chứng từ.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải lên chứng từ.");
    } finally {
      setSavingDocument(false);
    }
  };

  const toggleDocumentSharing = async (document: SettingsDocument) => {
    if (!profile.farm_id || !canManageDocuments || sharingDocumentId) return;
    setSharingDocumentId(document.id);
    setMessage("");
    try {
      const response = await fetch("/api/settings/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: profile.farm_id,
          document_id: document.id,
          is_shared: !document.is_shared,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể cập nhật chia sẻ chứng từ.");

      setProfile(data.profile ?? profile);
      setMessage(data.message || "Đã cập nhật chia sẻ chứng từ.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật chia sẻ chứng từ.");
    } finally {
      setSharingDocumentId("");
    }
  };

  const renderShareSwitch = () => (
    <div className={styles.shareControl}>
      <span className={`${styles.statusPill} ${profile.is_map_shared ? "" : styles.statusPillOff}`}>
        {profile.is_map_shared ? "Đang chia sẻ" : "Đang tắt"}
      </span>
      <button
        type="button"
        className={`${styles.switchButton} ${profile.is_map_shared ? "" : styles.switchButtonOff}`}
        onClick={toggleSharing}
        disabled={loading || savingShare || !profile.farm_id || !canWriteFarm}
        aria-pressed={Boolean(profile.is_map_shared)}
        aria-label="Bật tắt chia sẻ trang trại"
      >
        <span className={styles.switchThumb}>
          <Icon name={profile.is_map_shared ? "check" : "lock"} />
        </span>
      </button>
    </div>
  );

  const renderFarmDisplay = () => (
    <>
      <div className={styles.farmRecordBody}>
        <div className={styles.farmDetailCard}>
          <dl className={styles.compactList}>
            <div><dt>Mã trang trại:</dt><dd>{farmCode}</dd></div>
            <div><dt>Tên trang trại:</dt><dd>{loading ? <CowLoading label="Đang tải..." /> : valueOrEmpty(profile.farm_name)}</dd></div>
            <div><dt>Khu vực:</dt><dd>{summary?.paddockCount ?? 0} ({formatNumber(profile.farm_area_hectare, " ha")})</dd></div>
            <div><dt>Tài sản:</dt><dd>{summary?.assetCount ?? 0}</dd></div>
            <div><dt>Vật nuôi:</dt><dd>{summary?.animalCount ?? 0}</dd></div>
            <div><dt>Tọa độ:</dt><dd>{coordinates}</dd></div>
            <div><dt>Địa chỉ:</dt><dd>{valueOrEmpty(profile.address_line_1 ?? profile.location_name)}</dd></div>
            <div><dt>Thành phố:</dt><dd>{valueOrEmpty(profile.city)}</dd></div>
            <div><dt>Tỉnh/Thành:</dt><dd>{valueOrEmpty(profile.state)}</dd></div>
            <div><dt>Quốc gia:</dt><dd>{valueOrEmpty(profile.country)}</dd></div>
            <div><dt>Liên kết bản đồ:</dt><dd>{valueOrEmpty(profile.maps_link)}</dd></div>
            <div><dt>Ghi chú:</dt><dd>{valueOrEmpty(profile.special_factors)}</dd></div>
          </dl>
        </div>

        <div className={styles.farmDetailCard}>
          <h4>Đơn vị tiêu chuẩn</h4>
          <dl className={styles.compactList}>
            {standardUnits.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}:</dt>
                <dd>{displayUnitValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className={styles.farmActions}>
        <button type="button" className={styles.editAction} onClick={openFarmEditor} disabled={loading || !profile.farm_id || !canWriteFarm}>
          <Icon name="edit" />
          Chỉnh sửa
        </button>
        <button type="button" className={styles.deleteAction} onClick={openDeleteModal} disabled={loading || deletingFarm || !profile.farm_id || !canWriteFarm}>
          <Icon name="trash" />
          {deletingFarm ? "Đang xóa..." : "Xóa"}
        </button>
      </div>
    </>
  );

  const renderStepStatus = (step: 1 | 2 | 3) => {
    if (step < editStep) return <span className={styles.stepDone}><Icon name="check" /></span>;
    return <span className={step === editStep ? styles.stepActive : styles.stepMuted}>{step}</span>;
  };

  const renderAddUserStepStatus = (step: 1 | 2 | 3) => {
    if (step < addUserStep) return <span className={styles.stepDone}><Icon name="check" /></span>;
    return <span className={step === addUserStep ? styles.stepActive : styles.stepMuted}>{step}</span>;
  };

  const renderFarmEditor = () => (
    <div className={styles.modalBackdrop} role="presentation">
      <form className={styles.farmModal} onSubmit={saveFarmProfile}>
        <header className={styles.modalHeader}>
          <h3>Chỉnh sửa trang trại</h3>
          <button type="button" onClick={() => setEditingFarm(false)} disabled={savingProfile} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.stepLayout}>
          <section className={`${styles.stepBlock} ${editStep === 1 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderStepStatus(1)}
              <strong>Chi tiết</strong>
            </div>
            {editStep === 1 && (
              <div className={styles.stepContent}>
                <label className={styles.modalField}>
                  <span>Tên trang trại:</span>
                  <input value={farmForm.farm_name} onChange={(event) => updateFarmForm("farm_name", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Địa chỉ dòng 1:</span>
                  <input value={farmForm.address_line_1} onChange={(event) => updateFarmForm("address_line_1", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Địa chỉ dòng 2:</span>
                  <input value={farmForm.address_line_2} onChange={(event) => updateFarmForm("address_line_2", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Thành phố:</span>
                  <input value={farmForm.city} onChange={(event) => updateFarmForm("city", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Mã bưu chính:</span>
                  <input value={farmForm.postal_code} onChange={(event) => updateFarmForm("postal_code", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Tỉnh/Thành:</span>
                  <input value={farmForm.state} onChange={(event) => updateFarmForm("state", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Quốc gia:</span>
                  <input value={farmForm.country} onChange={(event) => updateFarmForm("country", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Diện tích (ha):</span>
                  <input inputMode="decimal" value={farmForm.farm_area_hectare} onChange={(event) => updateFarmForm("farm_area_hectare", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Ghi chú:</span>
                  <input value={farmForm.special_factors} onChange={(event) => updateFarmForm("special_factors", event.target.value)} />
                </label>
                <button type="button" className={styles.continueAction} onClick={() => setEditStep(2)}>
                  Tiếp tục
                </button>
              </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${editStep === 2 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderStepStatus(2)}
              <strong>Vị trí</strong>
            </div>
            {editStep === 2 && (
              <div className={styles.stepContent}>
                <label className={styles.modalField}>
                  <span>Vĩ độ:</span>
                  <input inputMode="decimal" value={farmForm.latitude} onChange={(event) => updateFarmForm("latitude", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Kinh độ:</span>
                  <input inputMode="decimal" value={farmForm.longitude} onChange={(event) => updateFarmForm("longitude", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Liên kết bản đồ:</span>
                  <input value={farmForm.maps_link} onChange={(event) => updateFarmForm("maps_link", event.target.value)} />
                </label>
                <div className={styles.stepActions}>
                  <button type="button" className={styles.continueAction} onClick={() => setEditStep(3)}>
                    Tiếp tục
                  </button>
                  <button type="button" className={styles.cancelAction} onClick={() => setEditStep(1)}>
                    Quay lại
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${editStep === 3 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderStepStatus(3)}
              <strong>Đơn vị tiêu chuẩn</strong>
            </div>
            {editStep === 3 && (
              <div className={styles.stepContent}>
                {UNIT_FIELDS.map((unit) => (
                  <label key={unit.key} className={styles.modalField}>
                    <span>{unit.label}:</span>
                    <select value={farmForm.standard_units[unit.key] ?? ""} onChange={(event) => updateUnitForm(unit.key, event.target.value)}>
                      {UNIT_OPTIONS[unit.key].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <button type="button" className={styles.cancelAction} onClick={() => setEditStep(2)}>
                  Quay lại
                </button>
              </div>
            )}
          </section>
        </div>

        <footer className={styles.modalFooter}>
          <button type="submit" className={styles.modalPrimaryAction} disabled={savingProfile}>
            <Icon name="save" />
            {savingProfile ? "Đang cập nhật..." : "Cập nhật"}
          </button>
          <button
            type="button"
            className={styles.cancelAction}
            onClick={() => {
              setFarmForm(profileToFarmForm(profile));
              setEditStep(1);
              setEditingFarm(false);
            }}
            disabled={savingProfile}
          >
            <Icon name="close" />
            Hủy
          </button>
        </footer>
      </form>
    </div>
  );

  const renderDeleteModal = () => (
    <div className={styles.modalBackdrop} role="presentation">
      <div className={styles.deleteModal} role="dialog" aria-modal="true" aria-labelledby="delete-farm-title">
        <header className={styles.modalHeader}>
          <h3 id="delete-farm-title">
            {deletingFinalFarm ? "Xác nhận xóa trang trại & tài khoản" : "Xác nhận xóa trang trại"}
          </h3>
          <button type="button" onClick={closeDeleteModal} disabled={deletingFarm} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.deleteModalBody}>
          {deletingFinalFarm && (
            <>
              <p className={styles.deleteLead}>
                Bạn là <strong>chủ sở hữu và người tạo</strong> của {farmName}. Vì đây là trang trại cuối cùng, khi xóa trang trại hệ thống sẽ xóa cả <strong>tài khoản</strong> và trang trại còn lại của bạn.
              </p>

              <section className={styles.deleteSection}>
                <h4>Xác nhận xóa tài khoản</h4>
                <p>
                  Xóa tài khoản sẽ làm mất quyền truy cập vào toàn bộ dữ liệu của bạn, bao gồm thông tin cá nhân, cài đặt và lịch sử sử dụng.
                </p>
                <label className={styles.deleteCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmAccountDeletion}
                    onChange={(event) => setConfirmAccountDeletion(event.target.checked)}
                    disabled={deletingFarm}
                  />
                  <span>Tôi hiểu đây là xác nhận cuối cùng. Sau khi tiếp tục, tài khoản của tôi sẽ bị xóa vĩnh viễn.</span>
                </label>
              </section>
            </>
          )}

          <section className={styles.deleteSection}>
            <h4>Xác nhận xóa trang trại</h4>
            <p>
              Xóa trang trại sẽ xóa toàn bộ dữ liệu liên quan như khu vực, vật nuôi, chứng từ, kho, sự kiện, kế hoạch chăn thả, công việc và bản ghi vận hành. Bạn sẽ không còn quyền truy cập vào trang trại này.
            </p>
            <label className={styles.deleteCheckbox}>
              <input
                type="checkbox"
                checked={confirmFarmDeletion}
                onChange={(event) => setConfirmFarmDeletion(event.target.checked)}
                disabled={deletingFarm}
              />
              <span>Tôi hiểu đây là xác nhận cuối cùng. Sau khi tiếp tục, trang trại của tôi sẽ bị xóa vĩnh viễn.</span>
            </label>
          </section>

          <p className={styles.deleteWarning}>
            Tôi hiểu rằng thao tác này là cuối cùng, không thể hoàn tác và tôi sẽ mất quyền truy cập vào dữ liệu đã xóa.
            {deletingFinalFarm ? " Tôi cũng sẽ bị đăng xuất ngay sau khi quá trình xóa hoàn tất." : ""}
          </p>
        </div>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.dangerPrimaryAction} onClick={deleteFarm} disabled={deletingFarm || !canDeleteFarm}>
            <Icon name="trash" />
            {deletingFarm ? "Đang xóa..." : deletingFinalFarm ? "Xóa tài khoản & trang trại" : "Xóa trang trại"}
          </button>
          <button type="button" className={styles.cancelAction} onClick={closeDeleteModal} disabled={deletingFarm}>
            Hủy
          </button>
        </footer>
      </div>
    </div>
  );

  const renderAddUserModal = () => (
    <div className={styles.modalBackdrop} role="presentation">
      <form className={styles.userModal} onSubmit={saveAddUser}>
        <header className={styles.modalHeader}>
          <h3>Thêm người dùng mới</h3>
          <button type="button" onClick={closeAddUserModal} disabled={addingUser} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.stepLayout}>
          <section className={`${styles.stepBlock} ${addUserStep === 1 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderAddUserStepStatus(1)}
              <strong>Thông tin</strong>
            </div>
            {addUserStep === 1 && (
              <div className={styles.stepContent}>
                <p className={styles.stepHelp}>Thêm thông tin người dùng, bao gồm họ và tên.</p>
                <label className={styles.modalField}>
                  <span>Tên:</span>
                  <input value={addUserForm.first_name} onChange={(event) => updateAddUserForm("first_name", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Họ:</span>
                  <input value={addUserForm.last_name} onChange={(event) => updateAddUserForm("last_name", event.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Ngôn ngữ:</span>
                  <select value={addUserForm.language} onChange={(event) => updateAddUserForm("language", event.target.value)}>
                    <option value="vi-VN">Tiếng Việt (Việt Nam)</option>
                    <option value="en-US">Tiếng Anh (Mỹ)</option>
                  </select>
                </label>
                <div className={styles.modalField}>
                  <span>Kích hoạt:</span>
                  <button
                    type="button"
                    className={`${styles.smallSwitch} ${addUserForm.account_enabled ? "" : styles.smallSwitchOff}`}
                    onClick={() => updateAddUserForm("account_enabled", !addUserForm.account_enabled)}
                    aria-pressed={addUserForm.account_enabled}
                  >
                    <span>{addUserForm.account_enabled ? "Có" : "Không"}</span>
                    <i />
                  </button>
                </div>
                <p className={styles.stepNote}>
                  <strong>Lưu ý:</strong> Họ tên, ngôn ngữ, email và số điện thoại có thể được người dùng cập nhật lại sau khi đăng nhập.
                </p>
                <button type="button" className={styles.continueAction} onClick={() => setAddUserStep(2)}>
                  Tiếp tục
                </button>
              </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${addUserStep === 2 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderAddUserStepStatus(2)}
              <strong>Liên hệ</strong>
            </div>
            {addUserStep === 2 && (
              <div className={styles.stepContent}>
                <p className={styles.stepHelp}>Nhập email và số điện thoại của người dùng.</p>
                <label className={styles.modalField}>
                  <span>Điện thoại:</span>
                  <div className={styles.phoneInputGroup}>
                    <select value={addUserForm.phone_country} onChange={(event) => updateAddUserForm("phone_country", event.target.value)}>
                      <option value="+84">🇻🇳 +84</option>
                      <option value="+1">+1</option>
                      <option value="+61">+61</option>
                    </select>
                    <input inputMode="tel" value={addUserForm.phone_number} onChange={(event) => updateAddUserForm("phone_number", event.target.value)} />
                  </div>
                </label>
                <label className={styles.modalField}>
                  <span>Email:</span>
                  <input type="email" value={addUserForm.email} onChange={(event) => updateAddUserForm("email", event.target.value)} />
                </label>
                {checkingAddUserContact && <p className={styles.stepNote}>Đang kiểm tra email và số điện thoại...</p>}
                {addUserContactError && <p className={`${styles.stepNote} ${styles.stepError}`}>{addUserContactError}</p>}
                <div className={styles.stepActions}>
                  <button type="button" className={styles.continueAction} onClick={continueFromAddUserContact} disabled={checkingAddUserContact}>
                    Tiếp tục
                  </button>
                  <button type="button" className={styles.cancelAction} onClick={() => setAddUserStep(1)}>
                    Quay lại
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${addUserStep === 3 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {renderAddUserStepStatus(3)}
              <strong>Vai trò</strong>
            </div>
            {addUserStep === 3 && (
              <div className={styles.stepContent}>
                <p className={styles.stepHelp}>Chọn vai trò cho người dùng trong từng phạm vi.</p>
                <div className={styles.roleMatrix}>
                  <span>Vai trò gốc:</span>
                  <div className={styles.roleOptions}>
                    {(["none", "viewer", "editor", "admin"] as RoleCode[]).map((role) => (
                      <label key={role}>
                        <input
                          type="radio"
                          name="base_role"
                          value={role}
                          checked={addUserForm.base_role === role}
                          onChange={() => updateAddUserForm("base_role", role)}
                        />
                        {ROLE_LABELS[role]}{role === "viewer" ? " (chỉ xem)" : role === "editor" ? " (xem/sửa)" : role === "admin" ? " (toàn quyền)" : ""}
                      </label>
                    ))}
                  </div>

                  <span>{farmName}:</span>
                  <div className={styles.roleOptions}>
                    {(["none", "viewer", "editor", "admin"] as RoleCode[]).map((role) => (
                      <label key={role}>
                        <input
                          type="radio"
                          name="farm_role"
                          value={role}
                          checked={addUserForm.farm_role === role}
                          onChange={() => updateAddUserForm("farm_role", role)}
                        />
                        {ROLE_LABELS[role]}{role === "viewer" ? " (chỉ xem)" : role === "editor" ? " (xem/sửa)" : role === "admin" ? " (toàn quyền)" : ""}
                      </label>
                    ))}
                  </div>
                </div>
                <ul className={styles.roleHintList}>
                  <li><strong>Quản trị:</strong> xem và chỉnh sửa toàn bộ nội dung của từng trang trại.</li>
                  <li><strong>Không có quyền:</strong> không truy cập được trang trại đã chọn.</li>
                  <li><strong>Chỉ xem:</strong> chỉ xem nội dung trong trang trại đã chọn.</li>
                  <li><strong>Biên tập:</strong> xem và chỉnh sửa nội dung trong trang trại đã chọn.</li>
                </ul>
                <div className={styles.stepActions}>
                  <button type="button" className={styles.continueAction} onClick={() => setAddUserStep(3)}>
                    Hoàn tất
                  </button>
                  <button type="button" className={styles.cancelAction} onClick={() => setAddUserStep(2)}>
                    Quay lại
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className={styles.modalFooter}>
          <button type="submit" className={styles.modalPrimaryAction} disabled={!canSaveUser}>
            <Icon name="save" />
            {addingUser ? "Đang lưu..." : "Lưu"}
          </button>
          <button type="button" className={styles.cancelAction} onClick={closeAddUserModal} disabled={addingUser}>
            <Icon name="close" />
            Hủy
          </button>
        </footer>
      </form>
    </div>
  );

  const renderEditUserModal = () => {
    const isSelfEdit = Boolean(editUserForm.user_id && profile.owner_id && editUserForm.user_id === profile.owner_id);
    const stepStatus = (step: 1 | 2 | 3) => {
      if (editUserStep > step) return <span className={styles.stepDone}><Icon name="check" /></span>;
      if (editUserStep === step) return <span className={styles.stepActive}>{step}</span>;
      return <span className={styles.stepMuted}>{step}</span>;
    };

    return (
    <div className={styles.modalBackdrop} role="presentation">
      <form className={styles.userModal} onSubmit={saveEditUser}>
        <header className={styles.modalHeader}>
          <h3>CHỈNH SỬA NGƯỜI DÙNG</h3>
          <button type="button" onClick={closeEditUserModal} disabled={editingUser} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.stepLayout}>
          <section className={`${styles.stepBlock} ${editUserStep === 1 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {stepStatus(1)}
              <strong>Thông tin</strong>
            </div>
            {editUserStep === 1 && (
            <div className={styles.stepContent}>
              <p className={styles.stepHelp}>Cập nhật thông tin hiển thị của người dùng.</p>
              <label className={styles.modalField}>
                <span>Tên:</span>
                <input value={editUserForm.first_name} onChange={(event) => updateEditUserForm("first_name", event.target.value)} />
              </label>
              <label className={styles.modalField}>
                <span>Họ:</span>
                <input value={editUserForm.last_name} onChange={(event) => updateEditUserForm("last_name", event.target.value)} />
              </label>
              <label className={styles.modalField}>
                <span>Ngôn ngữ:</span>
                <select value={editUserForm.language} onChange={(event) => updateEditUserForm("language", event.target.value)}>
                  <option value="vi-VN">Tiếng Việt (Việt Nam)</option>
                  <option value="en-US">Tiếng Anh (Mỹ)</option>
                </select>
              </label>
              <label className={styles.modalField}>
                <span>Trạng thái:</span>
                <select value={editUserForm.status} onChange={(event) => updateEditUserForm("status", event.target.value as EditUserForm["status"])} disabled={isSelfEdit}>
                  <option value="active">Đang hoạt động</option>
                  <option value="disabled">Đã khóa</option>
                </select>
              </label>
              <p className={styles.stepNote}>
                <strong>Lưu ý:</strong> Họ tên, ngôn ngữ và trạng thái có thể chỉnh tại đây. Email và số điện thoại chỉ được xem ở bước Liên hệ, không cho phép thay đổi.
              </p>
              <button type="button" className={styles.continueAction} onClick={() => setEditUserStep(2)}>
                Tiếp tục
              </button>
            </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${editUserStep === 2 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {stepStatus(2)}
              <strong>Liên hệ</strong>
            </div>
            {editUserStep === 2 && (
            <div className={styles.stepContent}>
              <p className={styles.stepHelp}>Email và số điện thoại là thông tin định danh, chỉ hiển thị để đối chiếu.</p>
              <label className={styles.modalField}>
                <span>Số điện thoại:</span>
                <div className={styles.phoneInputGroup}>
                  <select value={editUserForm.phone_country} disabled>
                    <option value="+84">+84</option>
                    <option value="+1">+1</option>
                    <option value="+61">+61</option>
                  </select>
                  <input inputMode="tel" value={editUserForm.phone_number || "Chưa cập nhật"} disabled />
                </div>
              </label>
              <label className={styles.modalField}>
                <span>Email:</span>
                <input type="email" value={editUserForm.email || "Chưa cập nhật"} disabled />
              </label>
              <p className={styles.stepNote}>
                <strong>Lưu ý:</strong> Không thể thay đổi email hoặc số điện thoại trong màn hình phân quyền. Nếu cần đổi thông tin liên hệ, người dùng phải tự cập nhật trong hồ sơ cá nhân.
              </p>
              <div className={styles.stepActions}>
                <button type="button" className={styles.continueAction} onClick={() => setEditUserStep(3)} disabled={isSelfEdit}>
                  Tiếp tục
                </button>
                <button type="button" className={styles.cancelAction} onClick={() => setEditUserStep(1)}>
                  Quay lại
                </button>
              </div>
            </div>
            )}
          </section>

          <section className={`${styles.stepBlock} ${editUserStep === 3 ? styles.stepOpen : ""}`}>
            <div className={styles.stepTitle}>
              {stepStatus(3)}
              <strong>Vai trò</strong>
            </div>
            {editUserStep === 3 && (
            <div className={styles.stepContent}>
              <p className={styles.stepHelp}>Chọn vai trò truy cập của người dùng cho trang trại.</p>
              <div className={styles.roleMatrix}>
                <span>Vai trò gốc:</span>
                <div className={styles.roleOptions}>
                  {(["none", "viewer", "editor", "admin"] as RoleCode[]).map((role) => (
                    <label key={role}>
                      <input
                        type="radio"
                        name="edit_base_role"
                        value={role}
                        checked={editUserForm.base_role === role}
                        disabled={isSelfEdit}
                        onChange={() => updateEditUserForm("base_role", role)}
                      />
                      {ROLE_LABELS[role]}
                    </label>
                  ))}
                </div>

                <span>{farmName}:</span>
                <strong className={styles.readonlyRoleValue}>{displayRoleName(effectiveEditUserRole)}</strong>
              </div>
              <ul className={styles.roleHintList}>
                <li><strong>Quản trị:</strong> xem, chỉnh sửa dữ liệu và quản lý người dùng.</li>
                <li><strong>Không có quyền:</strong> không truy cập được trang trại đã chọn.</li>
                <li><strong>Chỉ xem:</strong> chỉ xem nội dung trong trang trại.</li>
                <li><strong>Biên tập:</strong> xem và chỉnh sửa nội dung trong trang trại.</li>
              </ul>
              <div className={styles.stepActions}>
                <button type="button" className={styles.continueAction} onClick={() => setEditUserStep(3)}>
                  Hoàn tất
                </button>
                <button type="button" className={styles.cancelAction} onClick={() => setEditUserStep(2)}>
                  Quay lại
                </button>
              </div>
            </div>
            )}
          </section>
        </div>

        <footer className={styles.modalFooter}>
          <button type="submit" className={styles.modalPrimaryAction} disabled={!canSaveEditedUser}>
            <Icon name="save" />
            {editingUser ? "Đang lưu..." : "Cập nhật"}
          </button>
          <button type="button" className={styles.cancelAction} onClick={closeEditUserModal} disabled={editingUser}>
            <Icon name="close" />
            Hủy
          </button>
        </footer>
      </form>
    </div>
    );
  };

  const renderDeleteUserModal = () => {
    const userName = deleteUserTarget ? displayUserName(deleteUserTarget) : "người dùng";
    const firstName = userName.split(" ")[0] || "người dùng";
    const deletingSelectedUser = deleteUserTarget ? deletingUserId === deleteUserTarget.member_id : false;

    return (
      <div className={styles.modalBackdrop} role="presentation">
        <div className={styles.deleteModal} role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
          <header className={styles.modalHeader}>
            <h3 id="delete-user-title">Xác nhận việc xóa bỏ {userName}</h3>
            <button type="button" onClick={closeDeleteUserModal} disabled={Boolean(deletingUserId)} aria-label="Đóng">
              <Icon name="close" />
            </button>
          </header>

          <div className={styles.deleteModalBody}>
            <p className={styles.deleteLead}>
              Bạn có chắc chắn muốn tiếp tục xóa {userName} khỏi hồ sơ trang trại của mình không?
            </p>
            <p className={styles.deleteLead}>
              Việc này sẽ dẫn đến việc <strong>mất vĩnh viễn</strong> quyền truy cập, phân quyền và các thông tin liên quan đến người dùng này trong trang trại.
            </p>
            <p className={styles.deleteLead}>
              Vui lòng đánh dấu vào ô xác nhận bên dưới để xác nhận rằng hành động này là cuối cùng và <strong>không thể đảo ngược</strong>.
            </p>

            <label className={styles.deleteCheckbox}>
              <input
                type="checkbox"
                checked={confirmUserDeletion}
                onChange={(event) => setConfirmUserDeletion(event.target.checked)}
                disabled={Boolean(deletingUserId)}
              />
              <span>
                Tôi hiểu rằng hành động này là không thể đảo ngược và tất cả dữ liệu liên quan đến {firstName} trong hồ sơ trang trại sẽ bị xóa vĩnh viễn.
              </span>
            </label>
          </div>

          <footer className={styles.modalFooter}>
            <button type="button" className={styles.dangerPrimaryAction} onClick={deleteUser} disabled={deletingSelectedUser || !confirmUserDeletion}>
              <Icon name="trash" />
              {deletingSelectedUser ? "Đang xóa..." : "Xóa bỏ"}
            </button>
            <button type="button" className={styles.cancelAction} onClick={closeDeleteUserModal} disabled={Boolean(deletingUserId)}>
              <Icon name="close" />
              Hủy bỏ
            </button>
          </footer>
        </div>
      </div>
    );
  };

  const renderDocumentCreateModal = () => (
    <div className={styles.modalBackdrop} role="presentation">
      <form className={styles.farmModal} onSubmit={saveDocument}>
        <header className={styles.modalHeader}>
          <h3>Thêm chứng từ mới</h3>
          <button type="button" onClick={closeDocumentCreateModal} disabled={savingDocument} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.documentUploadForm}>
          <div className={styles.documentUploadHeader}>
            <div>
              <h3>Tải chứng từ hình ảnh</h3>
              <p>Hỗ trợ giấy kiểm nghiệm, giấy phép kinh doanh, bằng khen, giấy kiểm định, bản ảnh và bản điện tử.</p>
            </div>
          </div>

          <div className={styles.documentFormGrid}>
            <label className={styles.formField}>
              <span>Tên chứng từ</span>
              <input value={documentForm.name} onChange={(event) => updateDocumentForm("name", event.target.value)} placeholder="Ví dụ: Giấy kiểm nghiệm rau hữu cơ" />
            </label>
            <label className={styles.formField}>
              <span>Loại chứng từ</span>
              <select value={documentForm.type} onChange={(event) => updateDocumentForm("type", event.target.value)}>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.formField}>
              <span>Số chứng từ</span>
              <input value={documentForm.number} onChange={(event) => updateDocumentForm("number", event.target.value)} placeholder="Không bắt buộc" />
            </label>
            <label className={styles.formField}>
              <span>Ngày ban hành</span>
              <input type="date" value={documentForm.issued_at} onChange={(event) => updateDocumentForm("issued_at", event.target.value)} />
            </label>
            <label className={styles.formField}>
              <span>Ngày hết hạn</span>
              <input type="date" value={documentForm.expires_at} onChange={(event) => updateDocumentForm("expires_at", event.target.value)} />
            </label>
            <label className={styles.formField}>
              <span>Ảnh chứng từ</span>
              <input type="file" accept="image/*" onChange={(event) => updateDocumentForm("file", event.target.files?.[0] ?? null)} />
            </label>
            <label className={`${styles.formField} ${styles.formFieldWide}`}>
              <span>Ghi chú</span>
              <textarea rows={3} value={documentForm.note} onChange={(event) => updateDocumentForm("note", event.target.value)} placeholder="Thông tin bổ sung về chứng từ" />
            </label>
            <label className={styles.documentShareOption}>
              <input type="checkbox" checked={documentForm.is_shared} onChange={(event) => updateDocumentForm("is_shared", event.target.checked)} />
              <span>Cho phép chia sẻ chứng từ này trên hồ sơ/bản đồ công khai khi cần.</span>
            </label>
          </div>
        </div>

        <footer className={styles.modalFooter}>
          <button type="submit" className={styles.modalPrimaryAction} disabled={savingDocument || !profile.farm_id}>
            <Icon name="save" />
            {savingDocument ? "Đang tải..." : "Tải lên"}
          </button>
          <button type="button" className={styles.cancelAction} onClick={closeDocumentCreateModal} disabled={savingDocument}>
            <Icon name="close" />
            Hủy
          </button>
        </footer>
      </form>
    </div>
  );

  const renderFarmPage = () => (
    <>
      <section className={styles.metricGrid}>
        <article className={styles.metricCard}><span>Trang trại</span><strong>{summary?.farmCount ?? (profile.farm_id ? 1 : 0)}</strong><small>{profile.farm_id ? "Đang quản lý" : "Chưa có trang trại"}</small></article>
        <article className={styles.metricCard}><span>Người dùng</span><strong>{summary?.userCount ?? 0}</strong><small>{summary?.activeUserCount ?? 0} đang hoạt động</small></article>
        <article className={styles.metricCard}><span>Vai trò</span><strong>{summary?.roleCount ?? 0}</strong><small>{summary?.currentRoleName || "Chưa có vai trò"}</small></article>
        <article className={styles.metricCard}><span>Lời mời</span><strong>{summary?.inviteCount ?? 0}</strong><small>{summary?.pendingInviteCount ?? 0} đang chờ</small></article>
      </section>

      <article className={styles.farmRecordCard}>
        <header className={styles.farmRecordHeader}>
          <div>
            <div className={styles.badgeRow}>
              <span className={styles.primaryBadge}>Chính</span>
              <span className={`${styles.shareBadge} ${profile.is_map_shared ? "" : styles.shareBadgeOff}`}>
                {profile.is_map_shared ? "Bật chia sẻ" : "Tắt chia sẻ"}
              </span>
            </div>
            <h3>{farmName}</h3>
          </div>
          {renderShareSwitch()}
        </header>

        {renderFarmDisplay()}
        {message && <p className={styles.notice}>{message}</p>}
      </article>
      {editingFarm && renderFarmEditor()}
      {deleteModalOpen && renderDeleteModal()}
    </>
  );

  const renderUsersPage = () => (
    <>
      <section className={styles.metricGrid}>
        <article className={styles.metricCard}><span>Trang trại</span><strong>{summary?.farmCount ?? (profile.farm_id ? 1 : 0)}</strong><small>{profile.farm_id ? "Đang quản lý" : "Chưa có trang trại"}</small></article>
        <article className={styles.metricCard}><span>Người dùng</span><strong>{summary?.userCount ?? userAccounts.length}</strong><small>Tối đa: 3</small></article>
        <article className={styles.metricCard}><span>Đang hoạt động</span><strong>{summary?.activeUserCount ?? 0}</strong><small>Đã kích hoạt</small></article>
        <article className={styles.metricCard}><span>Lời mời</span><strong>{summary?.inviteCount ?? 0}</strong><small>{summary?.pendingInviteCount ?? 0} đang chờ</small></article>
      </section>

      <div className={styles.userRecordList}>
        {loading && userAccounts.length === 0 ? (
          <article className={styles.userRecordCard}>
            <CowLoading label="Đang tải người dùng..." />
          </article>
        ) : userAccounts.length === 0 ? (
          <article className={styles.emptyState}>
            <span className={styles.inlineIcon}><Icon name="users" /></span>
            <h3>Chưa có người dùng</h3>
            <p>Danh sách người dùng sẽ hiển thị khi trang trại có thành viên hoặc lời mời.</p>
          </article>
        ) : (
          userAccounts.map((user, index) => {
            const userName = displayUserName(user);
            const baseRoleName = displayRoleName(user.base_role ?? user.role_code ?? user.role_name);
            const farmRoleName = displayRoleName(user.farm_role ?? user.role_code ?? user.role_name);
            const inviteStatusName = displayInviteStatus(user.invite_status, user.invite_accepted);

            return (
              <article key={user.member_id} className={styles.userRecordCard}>
                <header className={styles.userRecordHeader}>
                  <div>
                    <div className={styles.badgeRow}>
                      <span className={`${styles.userTag} ${user.invite_accepted ? styles.userTagAccepted : styles.userTagPending}`}>
                        {inviteStatusName}
                      </span>
                      {!user.is_owner && <span className={styles.userTagRole}>{farmRoleName}</span>}
                      {user.is_owner && <span className={styles.primaryBadge}>Chủ sở hữu</span>}
                      {user.is_current_user && <span className={styles.meBadge}>Tôi</span>}
                    </div>
                    <h3>{userName.toUpperCase()}</h3>
                  </div>
                </header>

                <div className={styles.userRecordBody}>
                  <div className={styles.userIdentity}>
                    <span
                      className={`${styles.userAvatar} ${user.avatar_url ? styles.userAvatarImage : ""}`}
                      style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})` } : undefined}
                    >
                      {!user.avatar_url && <Icon name="users" />}
                    </span>
                    <span>{displayUserCode(index)}</span>
                  </div>

                  <div className={styles.userDetailCard}>
                    <dl className={styles.compactList}>
                      <div><dt>Tên:</dt><dd>{userName}</dd></div>
                      <div><dt>Email:</dt><dd>{valueOrEmpty(user.email)}</dd></div>
                      <div><dt>Điện thoại:</dt><dd>{valueOrEmpty(user.phone)}</dd></div>
                      <div><dt>Ngôn ngữ:</dt><dd>{user.language || "vi-VN"}</dd></div>
                      <div><dt>Trạng thái:</dt><dd>{displayStatus(user.status)}</dd></div>
                      <div><dt>Lời mời:</dt><dd>{inviteStatusName}</dd></div>
                    </dl>

                    <div className={styles.userActions}>
                      <button type="button" className={styles.editAction} onClick={() => openEditUserModal(user)} disabled={user.is_invite || editingUser || (!canManageUsers && !user.is_current_user) || (user.is_owner && !user.is_current_user)}>
                        <Icon name="edit" />
                        Chỉnh sửa
                      </button>
                      <button type="button" className={styles.deleteAction} onClick={() => openDeleteUserModal(user)} disabled={!canManageUsers || user.is_owner || user.is_current_user || deletingUserId === user.member_id}>
                        <Icon name="trash" />
                        {deletingUserId === user.member_id ? "Đang xóa..." : `Xóa ${userName.split(" ")[0] || "người dùng"}`}
                      </button>
                      {canManageUsers && (
                      <button type="button" className={styles.addAction} onClick={openAddUserModal} disabled={!profile.farm_id || addingUser}>
                        <Icon name="userAdd" />
                        Thêm
                      </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.userDetailCard}>
                    <h4>Quyền trang trại</h4>
                    <dl className={styles.compactList}>
                      <div><dt>Vai trò gốc:</dt><dd>{baseRoleName}</dd></div>
                      <div><dt>{farmName}:</dt><dd>{farmRoleName}</dd></div>
                    </dl>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {message && <p className={styles.notice}>{message}</p>}
      {addUserModalOpen && renderAddUserModal()}
      {editUserModalOpen && renderEditUserModal()}
      {deleteUserModalOpen && renderDeleteUserModal()}
    </>
  );

  const renderDocumentsPage = () => {
    const documents = profile.documents ?? [];

    return (
      <>
        <section className={styles.metricGrid}>
          <article className={styles.metricCard}><span>Chứng từ</span><strong>{summary?.documentCount ?? documents.length}</strong><small>Đang lưu</small></article>
          <article className={styles.metricCard}><span>Chia sẻ</span><strong>{documents.filter((document) => document.is_shared).length}</strong><small>Đang bật</small></article>
          <article className={styles.metricCard}><span>Sắp hết hạn</span><strong>{summary?.expiringDocumentCount ?? 0}</strong><small>Trong 30 ngày</small></article>
          <article className={styles.metricCard}><span>Trang trại</span><strong>{profile.farm_id ? 1 : 0}</strong><small>{farmName}</small></article>
        </section>

        <section className={styles.documentViewerHeader}>
          <div>
            <h3>Danh sách chứng từ</h3>
            <p>Xem ảnh chứng từ đã lưu và bật/tắt chia sẻ từng chứng từ.</p>
          </div>
          {canManageDocuments && (
            <button type="button" className={styles.addAction} onClick={openDocumentCreateModal} disabled={!profile.farm_id || savingDocument}>
              <Icon name="document" />
              Thêm chứng từ
            </button>
          )}
        </section>

        {false && canManageDocuments && (
          <form className={styles.documentUploadForm} onSubmit={saveDocument}>
            <div className={styles.documentUploadHeader}>
              <div>
                <h3>Tải chứng từ hình ảnh</h3>
                <p>Hỗ trợ giấy kiểm nghiệm, giấy phép kinh doanh, bằng khen, giấy kiểm định, bản ảnh và bản điện tử.</p>
              </div>
              <button type="submit" className={styles.modalPrimaryAction} disabled={savingDocument || !profile.farm_id}>
                <Icon name="save" />
                {savingDocument ? "Đang tải..." : "Tải lên"}
              </button>
            </div>

            <div className={styles.documentFormGrid}>
              <label className={styles.formField}>
                <span>Tên chứng từ</span>
                <input value={documentForm.name} onChange={(event) => updateDocumentForm("name", event.target.value)} placeholder="Ví dụ: Giấy kiểm nghiệm rau hữu cơ" />
              </label>
              <label className={styles.formField}>
                <span>Loại chứng từ</span>
                <select value={documentForm.type} onChange={(event) => updateDocumentForm("type", event.target.value)}>
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formField}>
                <span>Số chứng từ</span>
                <input value={documentForm.number} onChange={(event) => updateDocumentForm("number", event.target.value)} placeholder="Không bắt buộc" />
              </label>
              <label className={styles.formField}>
                <span>Ngày ban hành</span>
                <input type="date" value={documentForm.issued_at} onChange={(event) => updateDocumentForm("issued_at", event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span>Ngày hết hạn</span>
                <input type="date" value={documentForm.expires_at} onChange={(event) => updateDocumentForm("expires_at", event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span>Ảnh chứng từ</span>
                <input type="file" accept="image/*" onChange={(event) => updateDocumentForm("file", event.target.files?.[0] ?? null)} />
              </label>
              <label className={`${styles.formField} ${styles.formFieldWide}`}>
                <span>Ghi chú</span>
                <textarea rows={3} value={documentForm.note} onChange={(event) => updateDocumentForm("note", event.target.value)} placeholder="Thông tin bổ sung về chứng từ" />
              </label>
              <label className={styles.documentShareOption}>
                <input type="checkbox" checked={documentForm.is_shared} onChange={(event) => updateDocumentForm("is_shared", event.target.checked)} />
                <span>Cho phép chia sẻ chứng từ này trên hồ sơ/bản đồ công khai khi cần.</span>
              </label>
            </div>
          </form>
        )}

        {documents.length === 0 ? (
          <article className={styles.emptyState}>
            <span className={styles.inlineIcon}><Icon name="document" /></span>
            <h3>Chưa có chứng từ</h3>
            <p>Tải ảnh giấy kiểm nghiệm, giấy phép kinh doanh, bằng khen, giấy kiểm định hoặc bản điện tử để lưu hồ sơ trang trại.</p>
          </article>
        ) : (
          <div className={styles.documentGrid}>
            {documents.map((document) => (
              <article key={document.id} className={styles.documentCard}>
                {document.file_url ? (
                  <a
                    className={`${styles.documentPreview} ${styles.documentPreviewImage}`}
                    href={document.file_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở ảnh chứng từ ${document.name}`}
                    style={{ backgroundImage: `url(${document.file_url})` }}
                  >
                    <span>{document.name}</span>
                  </a>
                ) : (
                  <div className={styles.documentPreviewPlaceholder}><Icon name="document" /></div>
                )}
                <div className={styles.documentCardBody}>
                  <div className={styles.badgeRow}>
                    <span className={styles.userTagRole}>{displayDocumentType(document.type)}</span>
                    <span className={`${styles.userTag} ${document.is_shared ? styles.userTagAccepted : styles.userTagPending}`}>
                      {document.is_shared ? "Đang chia sẻ" : "Không chia sẻ"}
                    </span>
                  </div>
                  <h3>{document.name}</h3>
                  <dl className={styles.compactList}>
                    <div><dt>Mã:</dt><dd>{document.code}</dd></div>
                    <div><dt>Số:</dt><dd>{valueOrEmpty(document.number)}</dd></div>
                    <div><dt>Ban hành:</dt><dd>{formatDateValue(document.issued_at)}</dd></div>
                    <div><dt>Hết hạn:</dt><dd>{formatDateValue(document.expires_at)}</dd></div>
                    <div><dt>Ghi chú:</dt><dd>{valueOrEmpty(document.note)}</dd></div>
                  </dl>
                  {canManageDocuments && (
                    <button
                      type="button"
                      className={`${styles.smallSwitch} ${document.is_shared ? "" : styles.smallSwitchOff}`}
                      onClick={() => toggleDocumentSharing(document)}
                      disabled={sharingDocumentId === document.id}
                      aria-pressed={Boolean(document.is_shared)}
                    >
                      <span>{document.is_shared ? "Chia sẻ" : "Không chia sẻ"}</span>
                      <i />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {documentCreateModalOpen && renderDocumentCreateModal()}
      </>
    );
  };

  return (
    <DashboardShell farmName={farmName} activePath="/dashboard/settings">
      <div className={styles.settingsPage}>
        <section className={styles.topBar}>
          <div className={styles.pageTitle}>
            <span className={styles.pageIcon}><Icon name="settings" /></span>
            <div>
              <p>Cài đặt hệ thống</p>
              <h1>{activeTab.label}</h1>
            </div>
          </div>
          <a href="/dashboard" className={styles.secondaryAction}>
            <Icon name="back" />
            Quay lại
          </a>
        </section>

        <nav className={styles.tabs} aria-label="Nhóm cài đặt">
          {availableTabs.map((tab) => (
            <a key={tab.section} href={tab.href} className={tab.section === section ? styles.tabActive : ""}>
              {tab.label}
            </a>
          ))}
        </nav>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}><Icon name={pageMeta.icon} /></span>
              <div>
                <h2>{pageMeta.title}</h2>
                <p>{pageMeta.description}</p>
              </div>
            </div>
          </div>

          {section === "farm" && renderFarmPage()}
          {section === "users" && renderUsersPage()}
          {section === "documents" && renderDocumentsPage()}
        </section>
      </div>
    </DashboardShell>
  );
}
