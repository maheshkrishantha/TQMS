import type { Prisma, Role } from "@prisma/client";

type AreaAssignment = { province: string; district: string };

export function tenderAccessFilter(
  user: { id: string; role: Role },
  assignments: AreaAssignment[],
): Prisma.TenderWhereInput {
  if (user.role !== "SALES_REP") return {};
  const areaConditions = assignments.flatMap((assignment) => {
    const provinceConditions: Prisma.TenderWhereInput[] = [
      { province: assignment.province },
      { province: null, institution: { is: { province: assignment.province } } },
    ];
    const districtConditions: Prisma.TenderWhereInput[] = assignment.district
      ? [
          { district: assignment.district },
          { district: null, institution: { is: { district: assignment.district } } },
        ]
      : [{}];
    return provinceConditions.flatMap((province) => districtConditions.map((district) => ({
      AND: [province, district],
    })));
  });
  return {
    OR: [
      { responsibleRepId: user.id },
      ...areaConditions,
    ],
  };
}
