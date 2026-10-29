"use client";

import Link from "next/link";
import type { Role } from "@/lib/auth";
import { roleLabel } from "@/lib/auth";
import { maskFixed, maskPhone } from "@/lib/privacy";

type Group = { id: number; nama: string };
type Member = {
  id: number;
  nama: string;
  alamat_rt: string | null;
  nomor_telepon: string | null;
  kelompok: string | null;
  nik_ktp: string | null;
  nik_kk: string | null;
  created_at: string;
  warga_kelompok?: { kelompok_id: number }[];
};

type Props = {
  groups: Group[];
  members: Member[];
  rolesByWargaId: Record<number, Role>;
  selectedGroup: string;
  onSelectGroup: (groupName: string) => void;
  isRestricted: boolean;
  canEdit: boolean;
};

export default function UserMemberDirectory({ groups, members, rolesByWargaId, selectedGroup, onSelectGroup, isRestricted, canEdit }: Props) {
  const groupNames = ["Semua", ...groups.map((group) => group.nama)];
  const activeGroup = selectedGroup !== "Semua" && groups.some((group) => group.nama === selectedGroup) ? selectedGroup : "Semua";
  const memberGroupNames = (member: Member) => {
    const names = (member.warga_kelompok ?? [])
      .map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama)
      .filter((name): name is string => Boolean(name));
    return names.length ? names : member.kelompok ? [member.kelompok] : [];
  };
  const visibleMembers = members
    .filter((member) => (member.warga_kelompok ?? []).length > 0)
    .filter((member) => activeGroup === "Semua" || memberGroupNames(member).includes(activeGroup))
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id - right.id);
  const groupForLink = (member?: Member) => activeGroup !== "Semua" ? activeGroup : member ? memberGroupNames(member)[0] : "";
  const membersUrl = (groupName: string) => groupName ? `/warga?kelompok=${encodeURIComponent(groupName)}` : "/warga";

  return <section className="member-directory">
    <div className="member-directory-head">
      <div><span className="fund-label">DAFTAR ANGGOTA</span><h2>Anggota</h2><small>Data anggota mengikuti daftar warga pada kartu kelompok.</small></div>
      {canEdit && <Link className="edit-user" href={membersUrl(groupForLink())}>+ Tambah anggota</Link>}
    </div>
    <div className="group-tabs" role="tablist" aria-label="Filter kelompok">
      {groupNames.map((name) => <button key={name} type="button" className={activeGroup === name ? "selected" : ""} onClick={() => onSelectGroup(name)}>{name}</button>)}
    </div>
    <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-[1380px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
          <tr>
            <th className="whitespace-nowrap px-4 py-3">No</th>
            <th className="whitespace-nowrap px-4 py-3">Nama</th>
            <th className="whitespace-nowrap px-4 py-3">Alamat</th>
            <th className="whitespace-nowrap px-4 py-3">No. HP</th>
            <th className="whitespace-nowrap px-4 py-3">Kelompok</th>
            <th className="whitespace-nowrap px-4 py-3">Role</th>
            <th className="whitespace-nowrap px-4 py-3">KTP</th>
            <th className="whitespace-nowrap px-4 py-3">KK</th>
            <th className="whitespace-nowrap px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {visibleMembers.map((member, index) => {
            const role = rolesByWargaId[member.id] ?? "anggota";
            const groupNamesForMember = memberGroupNames(member);
            return <tr key={member.id} className="border-t border-zinc-200 align-top">
              <td className="whitespace-nowrap px-4 py-3">{index + 1}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium">{member.nama || "-"}</td>
              <td className="px-4 py-3">{member.alamat_rt || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskPhone(member.nomor_telepon) : member.nomor_telepon || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{groupNamesForMember.join(", ") || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3"><span className={`role-pill role-${role}`}>{roleLabel(role)}</span></td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskFixed(member.nik_ktp, 6) : member.nik_ktp || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskFixed(member.nik_kk, 6) : member.nik_kk || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3"><Link className="edit-user" href={membersUrl(groupForLink(member))}>{canEdit ? "Kelola" : "Lihat"}</Link></td>
            </tr>;
          })}
          {visibleMembers.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-zinc-500">{activeGroup === "Semua" ? "Belum ada data anggota." : `Belum ada anggota di ${activeGroup}.`}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
