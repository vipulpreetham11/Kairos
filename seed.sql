-- =====================================================
-- Kairos Demo Seed Data
-- =====================================================
-- Run in Supabase SQL Editor
-- School ID: 40d5192d-0316-42ab-b48d-a11c17756acb
-- DO NOT insert a new school — it already exists.
-- Idempotent: safe to re-run (cleans up first).
-- =====================================================

-- =====================================================
-- PART 0: CLEANUP existing seed data (FK-safe order)
-- Run this first so the script is re-runnable.
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
BEGIN
  -- Deepest dependents first
  DELETE FROM homework_submissions WHERE school_id = v_sid;
  DELETE FROM class_diary WHERE school_id = v_sid;
  DELETE FROM student_risk_scores WHERE school_id = v_sid;
  DELETE FROM ai_insights WHERE school_id = v_sid;
  DELETE FROM rankings WHERE school_id = v_sid;
  DELETE FROM hall_tickets WHERE school_id = v_sid;
  DELETE FROM results WHERE school_id = v_sid;
  DELETE FROM exam_subjects WHERE school_id = v_sid;
  DELETE FROM exams WHERE school_id = v_sid;
  DELETE FROM attendance WHERE school_id = v_sid;
  DELETE FROM concessions WHERE school_id = v_sid;
  DELETE FROM fee_receipts WHERE school_id IN (
    SELECT fp.school_id FROM fee_payments fp WHERE fp.school_id = v_sid
  );
  DELETE FROM fee_payments WHERE school_id = v_sid;
  DELETE FROM fee_invoices WHERE school_id = v_sid;
  DELETE FROM fee_structures WHERE school_id = v_sid;
  DELETE FROM fee_terms WHERE school_id = v_sid;
  DELETE FROM fee_heads WHERE school_id = v_sid;
  DELETE FROM teacher_assignments WHERE school_id = v_sid;
  DELETE FROM timetable_slots WHERE school_id = v_sid;
  DELETE FROM enrollments WHERE school_id = v_sid;
  DELETE FROM student_parents WHERE school_id = v_sid;
  DELETE FROM parents WHERE school_id = v_sid;
  DELETE FROM students WHERE school_id = v_sid;
  DELETE FROM subjects WHERE school_id = v_sid;
  DELETE FROM sections WHERE school_id = v_sid;
  DELETE FROM classes WHERE school_id = v_sid;
  RAISE NOTICE 'Cleanup complete for school %', v_sid;
END $$;

-- =====================================================
-- PART 1: Classes, Sections, Students, Enrollments, Subjects
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
  v_ay uuid := 'df144373-a706-4d21-a905-bea8083b6282';
  v_cid uuid;
  v_sa uuid;
  v_sb uuid;
  v_stid uuid;
  v_subid uuid;
  i integer;
  j integer;
  k integer;
  s integer;
  v_fn text;
  v_ln text;
  v_gender text;
  v_adm text;
  v_roll text;
  male_fn text[] := ARRAY[
    'Ravi','Arjun','Venkat','Kiran','Suresh','Ramesh','Ganesh','Mahesh','Rajesh','Srinivas',
    'Arun','Vijay','Naveen','Prasad','Harish','Sathish','Dinesh','Anand','Mohan','Praveen',
    'Chandra','Surya','Krishna','Murali','Bharath','Vamsi','Akhil','Teja','Pavan','Rahul',
    'Deepak','Manoj','Sanjay','Rohit','Nikhil','Varun','Tarun','Srikanth','Balaji','Karthik',
    'Aditya','Shiva','Sekhar','Siddharth','Ashok','Gopal','Rakesh','Naga','Phani','Sai'
  ];
  female_fn text[] := ARRAY[
    'Priya','Sneha','Lakshmi','Divya','Swathi','Kavitha','Anjali','Pooja','Meena','Rani',
    'Geetha','Revathi','Bhavani','Jyothi','Nandini','Padma','Usha','Vani','Sangeetha','Deepa',
    'Radha','Anitha','Lavanya','Keerthi','Mounika','Harika','Sahithi','Sravani','Madhavi','Sushma'
  ];
  last_n text[] := ARRAY[
    'Reddy','Rao','Nair','Sharma','Patel','Kumar','Naidu','Iyer','Pillai','Menon',
    'Goud','Varma','Shetty','Hegde','Murthy','Babu','Chowdary','Acharya','Bhat','Kulkarni'
  ];
  subj_names text[] := ARRAY['Mathematics','Science','English','Telugu','Social Studies'];
  subj_codes text[] := ARRAY['MATH','SCI','ENG','TEL','SOC'];
  v_student_seq integer := 0;
  v_male_i integer := 0;
  v_female_i integer := 0;
BEGIN

  -- Create temp tables (session-scoped)
  DROP TABLE IF EXISTS tmp_classes;
  CREATE TEMP TABLE tmp_classes (
    class_num integer, class_id uuid, section_a uuid, section_b uuid
  );
  DROP TABLE IF EXISTS tmp_students;
  CREATE TEMP TABLE tmp_students (
    seq integer, student_id uuid, class_num integer,
    section_name text, section_id uuid, class_id uuid,
    student_name text, gender text, grp text
  );
  DROP TABLE IF EXISTS tmp_subjects;
  CREATE TEMP TABLE tmp_subjects (
    subject_id uuid, class_num integer, class_id uuid,
    subject_name text, subject_code text
  );

  -- ── CLASSES & SECTIONS ──
  FOR i IN 1..10 LOOP
    v_cid := gen_random_uuid();
    v_sa := gen_random_uuid();
    v_sb := gen_random_uuid();

    INSERT INTO classes (id, school_id, name, display_order)
    VALUES (v_cid, v_sid, 'Class ' || i, i);

    INSERT INTO sections (id, school_id, class_id, name)
    VALUES (v_sa, v_sid, v_cid, 'A'),
           (v_sb, v_sid, v_cid, 'B');

    INSERT INTO tmp_classes VALUES (i, v_cid, v_sa, v_sb);

    -- ── SUBJECTS per class ──
    FOR k IN 1..5 LOOP
      v_subid := gen_random_uuid();
      INSERT INTO subjects (id, school_id, name, code, class_id)
      VALUES (v_subid, v_sid, subj_names[k], subj_codes[k] || '-' || i, v_cid);
      INSERT INTO tmp_subjects VALUES (v_subid, i, v_cid, subj_names[k], subj_codes[k]);
    END LOOP;
  END LOOP;

  -- ── STUDENTS & ENROLLMENTS ──
  -- 30 per section, 2 sections per class = 60 per class = 300 total
  -- 60% male (18 per section), 40% female (12 per section)
  -- Groups: A=seq 1-8, B=seq 9-23, C=seq 24-300
  FOR i IN 1..10 LOOP
    FOR s IN 1..2 LOOP  -- section A=1, B=2
      FOR j IN 1..30 LOOP
        v_student_seq := v_student_seq + 1;
        v_stid := gen_random_uuid();

        -- Determine gender: first 18 in each section = male
        IF j <= 18 THEN
          v_gender := 'male';
          v_male_i := v_male_i + 1;
          v_fn := male_fn[((v_male_i - 1) % 50) + 1];
          v_ln := last_n[((v_male_i - 1) / 50 % 20) + 1];
        ELSE
          v_gender := 'female';
          v_female_i := v_female_i + 1;
          v_fn := female_fn[((v_female_i - 1) % 30) + 1];
          v_ln := last_n[((v_female_i - 1) / 30 % 20) + 1];
        END IF;

        v_adm := 'KAI-2025-' || LPAD(v_student_seq::text, 3, '0');
        v_roll := LPAD(j::text, 2, '0');

        INSERT INTO students (id, school_id, admission_no, full_name, gender, date_of_birth, admission_number)
        VALUES (
          v_stid, v_sid, v_adm,
          v_fn || ' ' || v_ln,
          v_gender,
          '2015-01-01'::date + (random() * 1800)::integer,
          v_adm
        );

        -- Enrollment
        INSERT INTO enrollments (school_id, student_id, class_id, section_id, academic_year_id, roll_number, status)
        SELECT v_sid, v_stid, tc.class_id,
               CASE WHEN s = 1 THEN tc.section_a ELSE tc.section_b END,
               v_ay, v_roll, 'active'
        FROM tmp_classes tc WHERE tc.class_num = i;

        -- Store in temp with group
        INSERT INTO tmp_students
        SELECT v_student_seq, v_stid, i,
               CASE WHEN s = 1 THEN 'A' ELSE 'B' END,
               CASE WHEN s = 1 THEN tc.section_a ELSE tc.section_b END,
               tc.class_id,
               v_fn || ' ' || v_ln,
               v_gender,
               CASE
                 WHEN v_student_seq <= 8 THEN 'A'
                 WHEN v_student_seq <= 23 THEN 'B'
                 ELSE 'C'
               END
        FROM tmp_classes tc WHERE tc.class_num = i;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Created % students, % male, % female', v_student_seq, v_male_i, v_female_i;
END $$;

-- =====================================================
-- PART 2: ATTENDANCE (6 months: June 2 – Nov 29, 2025)
-- Group A (seq 1-8): 40-55% chronic absentees
-- Group B (seq 9-23): declining 85% → 65%
-- Group C (seq 24-300): 78-95% normal
-- Working days: Mon-Sat (DOW 1-6)
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
  v_ay uuid := 'df144373-a706-4d21-a905-bea8083b6282';
  v_start date := '2025-06-02';
  v_end date := '2025-11-29';
BEGIN

  INSERT INTO attendance (school_id, student_id, section_id, academic_year_id, date, status)
  SELECT
    v_sid,
    ts.student_id,
    ts.section_id,
    v_ay,
    d::date,
    CASE
      -- Group A: chronic absentees 40-55%
      WHEN ts.grp = 'A' THEN
        CASE WHEN random() < (0.40 + (ts.seq::numeric / 8.0) * 0.15) THEN 'present' ELSE 'absent' END

      -- Group B: declining trend
      WHEN ts.grp = 'B' THEN
        CASE
          -- Month 1-2 (June-July): 88%
          WHEN d < '2025-08-01' THEN
            CASE WHEN random() < 0.88 THEN 'present' ELSE 'absent' END
          -- Month 3 (August): 82%
          WHEN d < '2025-09-01' THEN
            CASE WHEN random() < 0.82 THEN 'present' ELSE 'absent' END
          -- Month 4 (September): 76%
          WHEN d < '2025-10-01' THEN
            CASE WHEN random() < 0.76 THEN 'present' ELSE 'absent' END
          -- Month 5 (October): 70%
          WHEN d < '2025-11-01' THEN
            CASE WHEN random() < 0.70 THEN 'present' ELSE 'absent' END
          -- Month 6 (November): 65%
          ELSE
            CASE WHEN random() < 0.65 THEN 'present' ELSE 'absent' END
        END

      -- Group C: normal 78-95% with per-student base rate
      ELSE
        CASE WHEN random() < (0.78 + (hashtext(ts.student_id::text)::numeric / 2147483647.0 + 0.5) * 0.17)
             THEN 'present' ELSE 'absent' END
    END
  FROM tmp_students ts
  CROSS JOIN generate_series(v_start, v_end, '1 day'::interval) AS d
  WHERE EXTRACT(DOW FROM d::date) BETWEEN 1 AND 6;  -- Mon=1 to Sat=6

  RAISE NOTICE 'Attendance records inserted: %', (
    SELECT count(*) FROM attendance WHERE school_id = v_sid
  );
END $$;

-- =====================================================
-- PART 3: FEE HEADS, FEE TERMS, FEE INVOICES, PAYMENTS
-- 3 heads: Tuition, Transport, Activity
-- 2 terms: Term 1 (due 2025-08-01), Term 2 (due 2026-01-01)
-- Distribution: 60% paid, 20% partial, 15% overdue, 5% severe
-- Severely overdue (seq 1-15) overlaps with Group A
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
  v_ay uuid := 'df144373-a706-4d21-a905-bea8083b6282';
  fh_tuition uuid := gen_random_uuid();
  fh_transport uuid := gen_random_uuid();
  fh_activity uuid := gen_random_uuid();
  ft_term1 uuid := gen_random_uuid();
  ft_term2 uuid := gen_random_uuid();
  v_inv_id uuid;
  v_amt bigint;
  v_paid bigint;
  v_status text;
  v_pay_date date;
  v_receipt_seq integer := 0;
  rec record;
  fh_id uuid;
  ft_id uuid;
  fh_name text;
  ft_name text;
  fh_amt bigint;
BEGIN

  -- ── FEE HEADS ──
  INSERT INTO fee_heads (id, school_id, name, description, is_mandatory)
  VALUES
    (fh_tuition, v_sid, 'Tuition Fee', 'Monthly tuition charges', true),
    (fh_transport, v_sid, 'Transport Fee', 'School bus transport', false),
    (fh_activity, v_sid, 'Activity Fee', 'Extra-curricular activities', true);

  -- ── FEE TERMS ──
  INSERT INTO fee_terms (id, school_id, academic_year_id, name, due_date, order_index)
  VALUES
    (ft_term1, v_sid, v_ay, 'Term 1', '2025-08-01', 1),
    (ft_term2, v_sid, v_ay, 'Term 2', '2026-01-01', 2);

  -- ── FEE INVOICES & PAYMENTS ──
  -- Amounts: Tuition=25000, Transport=8000, Activity=5000 (in paise → ×100)
  FOR rec IN (SELECT * FROM tmp_students) LOOP
    FOREACH fh_id IN ARRAY ARRAY[fh_tuition, fh_transport, fh_activity] LOOP
      FOREACH ft_id IN ARRAY ARRAY[ft_term1, ft_term2] LOOP

        -- Determine amount based on fee head
        IF fh_id = fh_tuition THEN fh_amt := 2500000;     -- 25000 in paise
        ELSIF fh_id = fh_transport THEN fh_amt := 800000;  -- 8000
        ELSE fh_amt := 500000;                              -- 5000
        END IF;

        v_inv_id := gen_random_uuid();

        -- Determine payment status based on student sequence
        IF rec.seq <= 15 THEN
          -- 5% severely overdue 90+ days (seq 1-15, overlaps Group A)
          v_status := 'unpaid';
          v_paid := 0;
        ELSIF rec.seq <= 60 THEN
          -- 15% overdue 30-60 days (seq 16-60)
          v_status := 'unpaid';
          v_paid := 0;
        ELSIF rec.seq <= 120 THEN
          -- 20% partial payment (seq 61-120)
          v_paid := (fh_amt * (0.3 + random() * 0.4))::bigint;
          v_status := 'partial';
        ELSE
          -- 60% fully paid (seq 121-300)
          v_paid := fh_amt;
          v_status := 'paid';
        END IF;

        INSERT INTO fee_invoices (
          id, school_id, student_id, academic_year_id,
          fee_head_id, fee_term_id, amount_due, net_amount,
          amount_paid, outstanding, due_date, status
        ) VALUES (
          v_inv_id, v_sid, rec.student_id, v_ay,
          fh_id, ft_id, fh_amt, fh_amt,
          v_paid,
          fh_amt - v_paid,
          CASE WHEN ft_id = ft_term1 THEN '2025-08-01'::date ELSE '2026-01-01'::date END,
          v_status
        );

        -- Create payment record if any amount paid
        IF v_paid > 0 THEN
          v_receipt_seq := v_receipt_seq + 1;
          -- Payment date: within 2 weeks of due date for paid, later for partial
          IF v_status = 'paid' THEN
            v_pay_date := CASE WHEN ft_id = ft_term1
              THEN '2025-07-20'::date + (random() * 15)::integer
              ELSE '2025-12-20'::date + (random() * 15)::integer END;
          ELSE
            v_pay_date := CASE WHEN ft_id = ft_term1
              THEN '2025-08-15'::date + (random() * 30)::integer
              ELSE '2026-01-15'::date + (random() * 30)::integer END;
          END IF;

          INSERT INTO fee_payments (
            school_id, student_id, fee_invoice_id,
            receipt_number, amount, payment_mode, payment_date
          ) VALUES (
            v_sid, rec.student_id, v_inv_id,
            'RCP-' || LPAD(v_receipt_seq::text, 5, '0'),
            v_paid,
            (ARRAY['cash','upi','cheque'])[1 + (random() * 2)::integer],
            v_pay_date
          );
        END IF;

      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Fee invoices: %, Payments: %',
    (SELECT count(*) FROM fee_invoices WHERE school_id = v_sid),
    v_receipt_seq;
END $$;

-- =====================================================
-- PART 4: EXAMS, EXAM_SUBJECTS, RESULTS
-- Exam 1: Unit Test 1 (Sep 2025)
-- Exam 2: Term 1 Examination (Nov 2025)
-- 5 subjects per class, max=100, pass=35
-- School avg=58%, SD=15%
-- Group A (seq 1-8): failing 2+ subjects
-- seq 9-18: declining from Exam 1→2
-- seq 296-300: top performers 85%+
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
  v_ay uuid := 'df144373-a706-4d21-a905-bea8083b6282';
  v_exam1 uuid;
  v_exam2 uuid;
  v_esid uuid;
  rec_s record;
  rec_sub record;
  rec_cls record;
  v_marks numeric;
  v_base numeric;
  v_exam_num integer;
  v_eid uuid;
BEGIN

  -- Store exam IDs in temp table
  DROP TABLE IF EXISTS tmp_exams;
  CREATE TEMP TABLE tmp_exams (
    exam_num integer, exam_id uuid, class_num integer, class_id uuid
  );
  DROP TABLE IF EXISTS tmp_exam_subjects;
  CREATE TEMP TABLE tmp_exam_subjects (
    exam_id uuid, subject_id uuid, es_id uuid
  );

  -- Create exams per class (each class gets its own exam record)
  FOR rec_cls IN (SELECT * FROM tmp_classes) LOOP
    -- Exam 1: Unit Test 1
    v_exam1 := gen_random_uuid();
    INSERT INTO exams (id, school_id, academic_year_id, name, exam_type, class_id,
                       start_date, end_date, is_published, pass_percentage, status)
    VALUES (v_exam1, v_sid, v_ay, 'Unit Test 1', 'unit_test', rec_cls.class_id,
            '2025-09-15', '2025-09-20', true, 35, 'published');
    INSERT INTO tmp_exams VALUES (1, v_exam1, rec_cls.class_num, rec_cls.class_id);

    -- Exam 2: Term 1 Examination
    v_exam2 := gen_random_uuid();
    INSERT INTO exams (id, school_id, academic_year_id, name, exam_type, class_id,
                       start_date, end_date, is_published, pass_percentage, status)
    VALUES (v_exam2, v_sid, v_ay, 'Term 1 Examination', 'term', rec_cls.class_id,
            '2025-11-10', '2025-11-20', true, 35, 'published');
    INSERT INTO tmp_exams VALUES (2, v_exam2, rec_cls.class_num, rec_cls.class_id);

    -- Exam subjects for both exams
    FOR rec_sub IN (SELECT * FROM tmp_subjects WHERE class_num = rec_cls.class_num) LOOP
      v_esid := gen_random_uuid();
      INSERT INTO exam_subjects (id, school_id, exam_id, subject_id, max_marks, pass_marks, exam_date)
      VALUES (v_esid, v_sid, v_exam1, rec_sub.subject_id, 100, 35,
              '2025-09-15'::date + (random() * 5)::integer);
      INSERT INTO tmp_exam_subjects VALUES (v_exam1, rec_sub.subject_id, v_esid);

      v_esid := gen_random_uuid();
      INSERT INTO exam_subjects (id, school_id, exam_id, subject_id, max_marks, pass_marks, exam_date)
      VALUES (v_esid, v_sid, v_exam2, rec_sub.subject_id, 100, 35,
              '2025-11-10'::date + (random() * 10)::integer);
      INSERT INTO tmp_exam_subjects VALUES (v_exam2, rec_sub.subject_id, v_esid);
    END LOOP;
  END LOOP;

  -- ── RESULTS ──
  FOR rec_s IN (SELECT * FROM tmp_students) LOOP
    FOR v_exam_num IN 1..2 LOOP
      -- Get exam_id for this student's class
      SELECT exam_id INTO v_eid FROM tmp_exams
      WHERE exam_num = v_exam_num AND class_num = rec_s.class_num;

      FOR rec_sub IN (SELECT * FROM tmp_subjects WHERE class_num = rec_s.class_num) LOOP

        -- Determine base marks based on student group
        IF rec_s.seq <= 8 THEN
          -- Group A: failing, marks 15-40 range
          v_base := 15 + random() * 25;
          -- Make sure at least 2 subjects fail (marks < 35)
          IF rec_sub.subject_code IN ('MATH','SCI') THEN
            v_base := 8 + random() * 22;  -- 8-30, guaranteed fail
          END IF;

        ELSIF rec_s.seq >= 296 THEN
          -- Top performers: 85-98
          v_base := 85 + random() * 13;

        ELSIF rec_s.seq BETWEEN 9 AND 18 THEN
          -- Declining students: good in Exam 1, worse in Exam 2
          IF v_exam_num = 1 THEN
            v_base := 60 + random() * 20;  -- 60-80
          ELSE
            v_base := 35 + random() * 20;  -- 35-55 (big drop)
          END IF;

        ELSE
          -- Normal distribution: mean=58, SD=15
          -- Box-Muller approximation using uniform randoms
          v_base := 58 + 15 * (random() + random() + random() - 1.5) / 0.866;
        END IF;

        -- Clamp to 0-100
        v_marks := GREATEST(3, LEAST(100, ROUND(v_base)));

        INSERT INTO results (school_id, student_id, exam_id, subject_id,
                             marks_obtained, max_marks, is_absent, is_pass)
        VALUES (v_sid, rec_s.student_id, v_eid, rec_sub.subject_id,
                v_marks, 100, false, v_marks >= 35);

      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Results inserted: %',
    (SELECT count(*) FROM results WHERE school_id = v_sid);
END $$;

-- =====================================================
-- PART 5: CLASS DIARY (Homework entries) & SUBMISSIONS
-- ~20 homework entries per section over 6 months
-- Overall completion rate: 70%
-- seq 1-15: less than 20% completion (overlaps Group A)
-- =====================================================
DO $$
DECLARE
  v_sid uuid := '40d5192d-0316-42ab-b48d-a11c17756acb';
  v_ay uuid := 'df144373-a706-4d21-a905-bea8083b6282';
  v_diary_id uuid;
  rec_cls record;
  v_subj_id uuid;
  rec_stu record;
  v_date date;
  v_section_id uuid;
  v_hw_idx integer := 0;
  v_completion_rate numeric;
  v_status text;
  hw_topics text[] := ARRAY[
    'Practice problems from Ch. 3','Read pages 45-60 and summarize',
    'Complete worksheet on fractions','Write an essay on Dussehra',
    'Solve 20 problems from exercise 4.2','Draw and label the water cycle',
    'Learn vocabulary from Unit 5','Prepare a chart on Indian states',
    'Complete the lab observation sheet','Revise for upcoming test',
    'Write 5 sentences using new words','Solve the geometry problems',
    'Read the poem and answer questions','Complete the map work on Asia',
    'Practice multiplication tables','Write a paragraph on your hobby',
    'Complete the science experiment report','Solve word problems pg 78',
    'Draw the structure of a plant cell','Prepare notes on the Mughal Empire'
  ];
  subj_cycle integer := 0;
BEGIN

  -- Create homework diary entries: 20 per section (cycling through subjects)
  -- One homework roughly every 6-7 working days per section
  FOR rec_cls IN (SELECT * FROM tmp_classes) LOOP
    -- For both sections A and B
    FOREACH v_section_id IN ARRAY ARRAY[rec_cls.section_a, rec_cls.section_b] LOOP
      subj_cycle := 0;

      FOR v_hw_idx IN 1..20 LOOP
        -- Space homework roughly weekly: start June 9, add ~7 days per hw
        v_date := '2025-06-09'::date + ((v_hw_idx - 1) * 7);
        -- Skip if it falls on Sunday
        IF EXTRACT(DOW FROM v_date) = 0 THEN
          v_date := v_date + 1;
        END IF;

        -- Cycle through subjects
        subj_cycle := subj_cycle + 1;
        SELECT subject_id INTO v_subj_id
        FROM tmp_subjects
        WHERE class_num = rec_cls.class_num
        ORDER BY subject_name
        LIMIT 1 OFFSET ((subj_cycle - 1) % 5);

        v_diary_id := gen_random_uuid();

        INSERT INTO class_diary (
          id, school_id, class_id, section_id, subject_id,
          academic_year_id, date, period_number,
          what_was_taught, homework_given, homework_due_date, has_homework
        ) VALUES (
          v_diary_id, v_sid, rec_cls.class_id, v_section_id, v_subj_id,
          v_ay, v_date, 1 + (v_hw_idx % 6),
          'Covered topics from Chapter ' || v_hw_idx,
          hw_topics[((v_hw_idx - 1) % 20) + 1],
          v_date + 2,
          true
        );

        -- Create homework submissions for all students in this section
        FOR rec_stu IN (
          SELECT * FROM tmp_students
          WHERE section_id = v_section_id AND class_num = rec_cls.class_num
        ) LOOP
          -- Determine completion rate
          IF rec_stu.seq <= 15 THEN
            v_completion_rate := 0.15;  -- < 20% completion (Group A overlap)
          ELSE
            v_completion_rate := 0.72;  -- ~70% overall
          END IF;

          -- Determine status
          IF random() < v_completion_rate THEN
            v_status := 'completed';
          ELSE
            v_status := 'not_completed';
          END IF;

          INSERT INTO homework_submissions (
            school_id, diary_id, student_id, status
          ) VALUES (
            v_sid, v_diary_id, rec_stu.student_id, v_status
          );
        END LOOP;

      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Diary entries: %, Homework submissions: %',
    (SELECT count(*) FROM class_diary WHERE school_id = v_sid),
    (SELECT count(*) FROM homework_submissions WHERE school_id = v_sid);
END $$;

-- =====================================================
-- PART 6: CLEANUP TEMP TABLES
-- =====================================================
DROP TABLE IF EXISTS tmp_classes;
DROP TABLE IF EXISTS tmp_students;
DROP TABLE IF EXISTS tmp_subjects;
DROP TABLE IF EXISTS tmp_exams;
DROP TABLE IF EXISTS tmp_exam_subjects;

-- =====================================================
-- VERIFICATION QUERIES (run after seed to confirm)
-- =====================================================
-- SELECT 'classes' as tbl, count(*) FROM classes WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'sections', count(*) FROM sections WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'students', count(*) FROM students WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'enrollments', count(*) FROM enrollments WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'attendance', count(*) FROM attendance WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'fee_invoices', count(*) FROM fee_invoices WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'fee_payments', count(*) FROM fee_payments WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'results', count(*) FROM results WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb'
-- UNION ALL SELECT 'homework_subs', count(*) FROM homework_submissions WHERE school_id = '40d5192d-0316-42ab-b48d-a11c17756acb';
