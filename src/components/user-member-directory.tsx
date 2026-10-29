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
    <div className="user-table-wrap member-directory-table-wrap">
      <table className="user-table member-directory-table">
        <thead><tr><th>No</th><th>Nama</th><th>Alamat</th><th>No. HP</th><th>Kelompok</th><th>Role</th><th>KTP</th><th>KK</th><th>Aksi</th></tr></thead>
        <tbody>
          {visibleMembers.map((member, index) => {
            const role = rolesByWargaId[member.id] ?? "anggota";
            const groupNamesForMember = memberGroupNames(member);
            return <tr key={member.id}>
              <td>{index + 1}</td>
              <td className="member-directory-name">{member.nama || "-"}</td>
              <td>{member.alamat_rt || "-"}</td>
              <td>{isRestricted ? maskPhone(member.nomor_telepon) : member.nomor_telepon || "-"}</td>
              <td>{groupNamesForMember.join(", ") || "-"}</td>
              <td><span className={`role-pill role-${role}`}>{roleLabel(role)}</span></td>
              <td>{isRestricted ? maskFixed(member.nik_ktp, 6) : member.nik_ktp || "-"}</td>
              <td>{isRestricted ? maskFixed(member.nik_kk, 6) : member.nik_kk || "-"}</td>
              <td><Link className="edit-user" href={membersUrl(groupForLink(member))}>{canEdit ? "Kelola" : "Lihat"}</Link></td>
            </tr>;
          })}
          {visibleMembers.length === 0 && <tr><td colSpan={9} className="empty-table-note">{activeGroup === "Semua" ? "Belum ada data anggota." : `Belum ada anggota di ${activeGroup}.`}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
