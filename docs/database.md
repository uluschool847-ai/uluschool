# Database Schema Design

This document details the database schema additions designed to support the mathSchool scaling effort. The schema uses Prisma ORM.

## 1. Content Management System (CMS) Models

These models replace hard-coded website content with dynamic, database-driven entries.

- **`PageContent`**
  - `id`: String (CUID)
  - `slug`: String (Unique identifier for the page, e.g., 'pricing')
  - `title`: String
  - `content`: Json (Structured content blocks)
  - `isPublished`: Boolean
  - `updatedAt`: DateTime

- **`BlogPost`**
  - `id`: String (CUID)
  - `slug`: String (Unique)
  - `title`: String
  - `content`: String (Markdown/HTML)
  - `authorId`: String (Relation to `AppUser`)
  - `isPublished`: Boolean
  - `publishedAt`: DateTime

- **`FaqItem`**
  - `id`: String (CUID)
  - `category`: String (e.g., 'General', 'Payments')
  - `question`: String
  - `answer`: String
  - `displayOrder`: Int

## 2. Educational / Portal Models

These models power the Teacher, Student, and Parent dashboards.

- **`CourseMaterial`**
  - `id`: String (CUID)
  - `title`: String
  - `fileUrl`: String
  - `type`: String (e.g., 'PDF', 'VIDEO')
  - `subjectId`: String (Relation to `Subject`)

- **`Homework`**
  - `id`: String (CUID)
  - `title`: String
  - `description`: String
  - `dueDate`: DateTime
  - `scheduledClassId`: String (Relation to `ScheduledClass`)

- **`HomeworkSubmission`**
  - `id`: String (CUID)
  - `studentId`: String (Relation to `AppUser` - Student)
  - `homeworkId`: String (Relation to `Homework`)
  - `contentUrl`: String (Link to submitted file)
  - `grade`: String?
  - `feedback`: String?
  - `submittedAt`: DateTime

- **`StudentProgress`**
  - `id`: String (CUID)
  - `studentId`: String
  - `subjectId`: String
  - `gradeLevel`: String
  - `teacherNotes`: String
  - `recordedAt`: DateTime

## 3. Automation and CRM Models

These models manage internal workflows and tasks.

- **`ManagerTask`**
  - `id`: String (CUID)
  - `title`: String
  - `description`: String
  - `assignedToId`: String? (Relation to Admin `AppUser`)
  - `dueDate`: DateTime
  - `status`: Enum (PENDING, IN_PROGRESS, COMPLETED)
  - `relatedEnquiryId`: String? (Relation to `Enquiry`)

## 4. Business Intelligence (BI) Models

These models store financial and lifecycle data to power the analytics dashboards.

- **`StudentSubscription`**
  - `id`: String (CUID)
  - `studentId`: String
  - `planName`: String
  - `status`: Enum (ACTIVE, CANCELLED, PAST_DUE)
  - `startDate`: DateTime
  - `endDate`: DateTime?

- **`PaymentTransaction`**
  - `id`: String (CUID)
  - `subscriptionId`: String?
  - `studentId`: String
  - `amount`: Float
  - `currency`: String
  - `status`: Enum (SUCCESS, FAILED, PENDING)
  - `paymentDate`: DateTime

## Data Integrity and Performance
- All new foreign keys will utilize appropriate `onDelete` cascades (e.g., deleting a `Homework` deletes its `HomeworkSubmission`s).
- Strategic `@@index` directives will be placed on query-heavy columns like `dueDate`, `slug`, and `status`.
