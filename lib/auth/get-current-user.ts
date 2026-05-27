import { createServerClient } from '@/lib/supabase/server'
import type { Role, SchoolContext } from '@/types/ai'
type AuthErrorCode =
  | 'NO_SESSION'
  | 'USER_NOT_FOUND'
  | 'ACCOUNT_INACTIVE'
  | 'NO_SCHOOL_LINKED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'SECTION_NOT_ASSIGNED'
  | 'STUDENT_NOT_YOUR_CHILD'
  | 'STUDENT_NOT_IN_YOUR_SECTION'
  | 'PARENT_NOT_FOUND'
  | 'NO_SECTIONS_ASSIGNED'
  | 'SCHOOL_ID_MISMATCH'
  | 'NO_CHILDREN_LINKED'
export class AuthError extends Error {
  constructor(public code: AuthErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'AuthError'
  }
}
export async function getCurrentUser(): Promise<SchoolContext> {
  const supabase = await createServerClient()
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !authUser) throw new AuthError('NO_SESSION')
  const { data: user } = await supabase
    .from('users')
    .select('id, role, school_id, full_name, email, is_active')
    .eq('id', authUser.id)
    .maybeSingle()
  if (!user) throw new AuthError('USER_NOT_FOUND')
  if (!user.is_active) throw new AuthError('ACCOUNT_INACTIVE')
  if (!user.school_id) throw new AuthError('NO_SCHOOL_LINKED')
  const { data: year } = await supabase
    .from('academic_years')
    .select('id, name')
    .eq('school_id', user.school_id)
    .eq('is_current', true)
    .maybeSingle()
  return {
    userId: user.id,
    role: user.role as Role,
    schoolId: user.school_id,
    schoolName: '',
    schoolLogo: null,
    userName: user.full_name ?? '',
    userEmail: user.email ?? '',
    academicYearId: year?.id ?? null,
    academicYearName: year?.name ?? null,
    hasActiveYear: Boolean(year?.id),
  }
}
export async function requireRole(roles: Role[]): Promise<SchoolContext> {
  const user = await getCurrentUser()
  if (!roles.includes(user.role as Role)) {
    throw new AuthError('INSUFFICIENT_PERMISSIONS')
  }
  return user
}
export async function getParentChildIds(
  parentUserId: string,
  schoolId: string
): Promise<string[]> {
  const supabase = await createServerClient()
  const { data: parent } = await supabase
    .from('parents')
    .select('id, school_id')
    .eq('user_id', parentUserId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!parent) throw new AuthError('PARENT_NOT_FOUND')
  if (parent.school_id !== schoolId) throw new AuthError('SCHOOL_ID_MISMATCH')
  const { data: links } = await supabase
    .from('student_parents')
    .select('student_id, school_id')
    .eq('parent_id', parent.id)
    .eq('school_id', schoolId)
  const childIds = (links ?? [])
    .map((row) => row.student_id)
    .filter((id): id is string => typeof id === 'string')
  if (childIds.length === 0) throw new AuthError('NO_CHILDREN_LINKED')
  return childIds
}
export async function requireParentOwnsStudent(
  studentId: string,
  parentUserId: string,
  schoolId: string
): Promise<void> {
  const childIds = await getParentChildIds(parentUserId, schoolId)
  if (!childIds.includes(studentId)) {
    throw new AuthError('STUDENT_NOT_YOUR_CHILD')
  }
}
export async function requireStudentInTeacherSection(
  studentId: string,
  teacherUserId: string,
  schoolId: string,
  academicYearId: string
): Promise<void> {
  const supabase = await createServerClient()
  const { data: assignments } = await supabase
    .from('teacher_assignments')
    .select('section_id')
    .eq('teacher_id', teacherUserId)
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
  const sectionIds = (assignments ?? [])
    .map((row) => row.section_id)
    .filter((id): id is string => typeof id === 'string')
  if (sectionIds.length === 0) throw new AuthError('NO_SECTIONS_ASSIGNED')
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('school_id', schoolId)
    .in('section_id', sectionIds)
    .maybeSingle()
  if (!enrollment) throw new AuthError('STUDENT_NOT_IN_YOUR_SECTION')
}
export function getClientSafeError(code: string): string {
  const map: Record<string, string> = {
    NO_SESSION: 'Please sign in to continue.',
    USER_NOT_FOUND: 'Account not found. Contact your school admin.',
    ACCOUNT_INACTIVE: 'Your account has been deactivated. Contact your school admin.',
    NO_SCHOOL_LINKED: 'Your account is not linked to a school. Contact support.',
    INSUFFICIENT_PERMISSIONS: 'You do not have permission to access this page.',
    SECTION_NOT_ASSIGNED: 'You are not assigned to any sections.',
    STUDENT_NOT_YOUR_CHILD: 'You do not have access to this student.',
    STUDENT_NOT_IN_YOUR_SECTION: 'This student is not in your section.',
    PARENT_NOT_FOUND: 'Parent profile not found. Contact your school admin.',
    NO_SECTIONS_ASSIGNED: 'No sections assigned to your account.',
    SCHOOL_ID_MISMATCH: 'Access denied.',
    NO_CHILDREN_LINKED: 'No children linked to your account.',
  }
  return map[code] ?? 'An unexpected error occurred. Please try again.'
}
