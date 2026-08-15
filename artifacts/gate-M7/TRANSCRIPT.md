# What the live models produced

### interview — the round asked

```
Who opens this app on Monday morning, and what do they need to get done with it?*
Select all that apply
The gym owner or manager(Recommended)
Checking schedules and managing staff assignments.
A climbing instructor
Viewing assigned classes and updating personal availability.
An enthusiastic gym member
Booking a class or checking scheduled activities.
Other — your own answer
What is hard about the current scheduling process for the chosen user?*
Select all that apply
Manually tracking instructor schedules and class times
Difficult to update a schedule in real-time.
Struggling with communication between the gym owner and instructors
No clear way of sending updates or reminders.
Handling class bookings manually
Inefficient to track member signups and cancellations separately.
Other — your own answer
What would make this app incredibly helpful?*
Select all that apply
Real-time updates and syncing across devices
Ensuring everyone has access to the latest schedule instantly.
A simple, user-friendly interface for booking classes
Allowing members to easily sign up or cancel from any device.
Efficient scheduling tools that handle conflicts and reminders automatically
Automatically resolving scheduling conflicts without additional effort from owners and instructors.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### interview — the round asked

```
On Monday mornings, what exactly does Jane (the gym owner) do to manage the schedule and class bookings?*
Select all that apply
Jane updates instructor schedules manually in a spreadsheet.
Jane spends time each Monday typing out who teaches which classes for the week.
Jane tracks class reservations written down or through emails from members.
Jane compiles booking requests on paper files or collects emails to keep track of scheduled participants.
Jane manages instructor availability using paper forms and notes.
Jane uses sticky notes, calendars with marks on them etc. to understand which instructors are available this week
Jane updates schedules across multiple devices but struggles with accuracy of real-time data.
Jane has started using apps and tools but finds maintaining consistency and up-to-date information difficult.
Something else not listed here.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### constitution — the round asked

```
What one rule does this web app have to follow, no matter what?*
Select one
Only allow bookings for classes that are scheduled.
The system will not accept reservations for unscheduled periods.
Guarantee instructor availability before scheduling a class.
Ensure there's always an approved instructor for every booking hour.
Other — your own answer
What types of sensitive information will this app handle?*
Select all that apply
Personal contact details of gym members and instructors.
Contains email addresses, phone numbers.
Physical location data for member addresses.
Includes home or work addresses required for services outside class bookings.
Other — your own answer
What areas should this app intentionally avoid during its first version?*
Select all that apply
Incorporating complex payment systems for class fees.
Focuses on scheduling and booking management initially.
Handling external events or reservations outside the gym schedule.
Focus begins with in-house activities without integration of external calendars/events initially.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### constitution — the drafted document

```
## Project Vision

The climbing gym scheduler web application aims to streamline the process of scheduling instructors and taking class bookings for small climbing gyms. This tool will offer a user-friendly, lightweight solution that automates manual tracking tasks while ensuring that real-time syncing is maintained across all relevant parties.

## Core Principles

### Simplicity
- The interface should be minimalistic and intuitive.
- Operations are streamlined to reduce redundancy and allow staff to focus more on gym management than administrative matters.

### Reliability 
- The software must operate with high uptime and regular, swift updates based on user feedback.
- Data integrity is paramount; automated backups and robust security measures ensure that sensitive information remains safe.

### Scalability
- Designed initially for small gyms, the system should scale up easily and seamlessly accommodate larger or multi-location gyms.

### Transparency 
- Users have clear visibility into pricing, terms of service, and data privacy policies.
- Regular user surveys and transparent updates on development progress are conducted to ensure ongoing satisfaction and trust.

## Technology Constraints

- The web app must be accessible via all modern web browsers (Chrome, Firefox, Safari, Edge).
- Support for mobile devices is essential; the UI should adapt smoothly across different screen sizes.
- RESTful APIs will establish communication between back-end services and front-end clients to allow flexibility in updating client and server logic independently.

## Architecture Constraints

### Backend
- Hosted on AWS with a multi-region deployment strategy to ensure redundancy, uptime rates higher than 95%, and efficient data distribution. 
- Utilizes microservices architecture with Node.js Express for robust API handling.
- PostgreSQL database is used due to its performance for transactional consistency.

### Frontend
- React.js or Vue.js front end development framework will facilitate a rapid reaction interface that dynamically reacts to real-time updates.
- State management using Redux in combination with Context APIs to maintain consistent app state across components within the application.

## Testing Approaches

Automated testing with Jest and Cucumber for unit, integration, and acceptance tests respectively while ensuring compatibility with all supported environments through cross-browser testing. Manual exploratory testing is planned for user experience and une
```

### constitution — the review board

```
CONSTITUTION · REVIEW

needs revision

Tick the points you want applied, then choose. Nothing advances until you decide.

Must fix (1)
Core Principles · line 8
The description for reliability mentions swift updates based on user feedback, but does not elaborate on the specifics of how these updates will be managed or communicated to users.
Add details about the process and timeline for update delivery, including communication channels and release notes format.
Recommendations (1)
Performance Targets · line 34
The performance targets section specifies time thresholds but lacks concrete acceptance criteria or test scenarios to validate these metrics.
Include specific test cases or scenarios that will be used during development and QA phases to ensure the system meets or exceeds the stated performance goals.
Accept
Ignore
Request changes

Requesting changes needs at least one point ticked — only the ticked ones are applied.
```

### constitution — a question asked mid-review

```
If you ignore ▌
```

### requirements — the round asked

```
What exactly happens on Monday mornings right now that the new web app should automate?*
Select all that apply
Creating a new schedule for the week(Recommended)
Updating who teaches what classes each day from scratch.
Updating an existing weekly schedule
Modifying classes and times based on the previous week's schedule.
Creating bookings for new members
Registering new members who sign up for their first class of the week.
Other — your own answer
If someone wants to book a session on Tuesday at 6 PM, what steps would that entail in this web app?*
Select all that apply
Checking availability and booking immediately
Viewing available sessions and completing the booking process while browsing.
Receiving an email with scheduled sessions to book
Being on a list for automatic emails detailing upcoming session schedules.
Using a mobile app to complete one booking
Opening the mobile app, finding availability and completing sign-up details.
Other — your own answer
Does everyone see the same information in this new system, or do roles like 'owner', 'instructor', or 'guest' have different visibility?*
Select all that apply
Everyone sees all schedules and bookings
Users of any role viewing the same detailed information as others.
Information depends on user role
Owners and instructors see more details than guests who only view availability.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### requirements — the drafted document

```
## Overview

A web application, targeted specifically at the needs of small climbing gyms, aims to streamline and automate the process of scheduling instructors for classes and taking bookings from participants. This solution facilitates real-time syncing across all stakeholders involved and offers a user-friendly environment geared towards efficiency and ease-of-use in managing gym operations.

The application will help reduce manual tracking efforts while ensuring that critical data such as schedules and booking information remain up-to-date, accessible to staff and clients through intuitive interfaces designed to work on various devices and platforms. By leveraging modern web technologies like React for the frontend and RESTful APIs integrated into an AWS-hosted backend, the platform provides robust support structures necessary for high availability and performance under varying loads.

## User Roles

### Gym Owner
- Primary administrative responsibilities including setting up schedules, managing instructor availabilities, creating class offerings.
- Monitoring real-time updates and ensuring all gym staff is aligned with scheduling changes to maintain a safe and organized workout environment.

### Instructor 
- Submitting personal schedule preferences into the system for automated assignment management.
- Viewing their work responsibilities in advance via personalized calendars and receiving notifications of any shifts or adjustments needed.

### Member/Client
- Ability to enroll in classes by checking availabilities displayed on an easy-to-use online booking page where they can also view pricing structures, gym policies etc.
- Receiving automatic booking confirmations with critical details such as meeting times and safety procedures needed prior to the first session.

## Functional Requirements

1. **Scheduling Instructor Work Hours**
   - Enable Gym owners/administrators to create weekly schedules for instructors based on gym operations (MON_SCHEDULE_CREATE).
   - Feature allows setting fixed intervals of working days/hours when coupled with an intuitive drag-and-drop interface where specific blocks get locked/unlocked.

2. **Availability Search and Booking System**
   - Provide a robust database search function enabling clients to quickly find vacant slots available to book classes online based on availability of instructors (BROWSER_FIND_AVAILABILITY).
   
3. **Data Consistency Across Platform**
  - Ensure the same information remains consistently d
```

### requirements — the review board

```
REQUIREMENTS · REVIEW

needs revision

Tick the points you want applied, then choose. Nothing advances until you decide.

Must fix (3)
Functional Requirements · line 10
The requirement states 'setting fixed intervals of working days/hours' which is too vague. Does this mean pre-set options like every Monday and Wednesday from 3-6 PM? Or does it mean arbitrary periods that users define themselves?
Clarify what constitutes a 'fixed interval'. For example, specify whether these are predefined patterns or customizable time slots.
Functional Requirements · line 20
Requirement does not define the scope of search function - is it for specific instructors, classes, times? Without this context, how to test?
Clarify what kind of availability the search function should find (e.g., slots for specific classes or general instructor slots) and how detailed the functionality needs to be.
Non-Functional Requirements · line 105
The TTFB requirement is too low; even 'quick response time for real-time updates' may still not meet this standard under network delays or load. It needs to be more precise.
Specify a more detailed threshold like TTFB < 150 ms instead of an open-ended description.
Recommendations (1)
Non-Functional Requirements · line 97
The requirement only mentions modern browsers but does not specify the testing configurations or platforms it covers.
Define exact device models and OS versions to be tested for cross-platform compatibility.
Accept
Ignore
Request changes

Requesting changes needs at least one point ticked — only the ticked ones are applied.
```

### solution — the round asked

```
Where will people mainly use this app?*
Select all that apply
On a laptop or desktop computer
Users will primarily manage schedules and bookings from their office computer.
Using their smartphone or tablet
Users will mostly access the app on mobile devices for convenience.
On both laptop/tablet/phone equally
Different users may prefer different devices depending on location and time of day.
Other — your own answer
Does this app need to work with any tools you are already using?*
Select all that apply
Excel spreadsheet for tracking schedules and bookings
The web app should replace the current Excel-based scheduling system used every Monday morning.
Communication platforms like Slack or Microsoft Teams
Users need to receive booking notifications and schedule updates via messaging apps they currently use.
Other — your own answer
How many people will be using the app regularly?*
Select all that apply
A small group of staff around 5-10 who don't change much over time
The number of users, primarily instructors and gym management, will remain stable.
Number can vary with seasons or events sometimes changing by a handful each period
Staff count fluctuates due to seasonal changes in demand for staffing at the climbing gym.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### solution — the drafted document

```
## Overview

A web application targeted towards small climbing gyms, the ClimbEase Gym Manager offers streamlined scheduling for instructors and a user-friendly booking system for members. Designed to enhance operational efficiency, it ensures real-time updates across all stakeholder platforms. The tool aims to reduce manual overhead while providing critical booking data accessibility on various devices including laptops, desktops, and mobiles.

## High-Level Architecture Design

### Backend
- **Hosting**: AWS, enabling multi-regional deployment for efficient redundancy and high uptime (≥95%)
- **Framework**: Node.js with Express for robust API handling
- **Database**: PostgreSQL to manage transactional consistency  
- **Deployment Strategy**: Microservices architecture, containerized using Docker and Kubernetes

### Frontend
- **Framework(s)**: React.js or Vue.js for a dynamic user interface responsive across different devices
- **State Management**: Redux Context APIs combined to ensure consistent state management across components

## System Modules

1. Admin Dashboard - User Interface:
   - **Responsibilities**
     - Gym administrators manage schedules, instructor availabilities, and class offerings.
     - Monitoring real-time updates ensuring staff adherence to scheduling changes.

2. Instructor Panel - User Interface
   - Features allow instructors to submit personal schedule preferences for automated management by the system.
   - Personalized calendar access ensures visibility over work responsibilities, with notifications for any shifts or adjustments needed.

3. Member Booking System - User Interface 
   - Members can easily check availabilities and book classes from a simple online booking page.
   - Access to pricing structures and gym rules alongside automatic booking confirmations with key details are provided directly through the system interfaces.

4. Real-time Sync Engine:
   - Any change made on the backend syncs immediately across all user interfaces, ensuring accurate data accessibility for all parties involved.
 
5. Notification System: 
   - Automated alerts to both staff and members about schedule modifications or booking confirmations respectively.

## Data Model

### Core Entities
1. **Instructors**: Includes primary key (ID), profile picture URL, name, biography, availability calendar details.
2. **Schedules**: Holds weekly schedules for instructors, featuring fixed intervals of working days/hours with intuitive drag-and-drop in
```

### solution — the review board

```
SOLUTION · REVIEW

needs revision

Tick the points you want applied, then choose. Nothing advances until you decide.

Must fix (1)
System Modules · line 8
The responsibilities of the Instructor Panel in monitoring real-time updates are poorly defined and unclear as to who (staff or instructors) is being monitored. It's not specified if this feature enables staff to monitor instructor changes or if instructors notify staff.
Clarify whether this module allows administrators/staff members to monitor instructor schedule updates, or if it aids instructors in notifying staff of any personal schedule preferences and modifications.
Recommendations (1)
Data Model · line 31
The notification system's role and its relationship with other entities like Bookings or Classes is vaguely defined, making it unclear how notifications are generated and linked.
Specifically detail under 'Relationships' how Notifications are associated with other entities such as Bookings and Classes, including how the triggering of a new Notification happens in context.
Accept
Ignore
Request changes

Requesting changes needs at least one point ticked — only the ticked ones are applied.
```

### tasks — the round asked

```
What single feature would make this app useful on Monday morning?*
Select one
Automatically update instructor schedules based on past bookings and availability.
The system checks all stored data about staff preferences, gym needs and student demands to create a suitable schedule for the week and notifies instructors of their shifts.
Allow booking classes online so members can see available slots.
Members visit the website and find open class times; they pick one that fits their schedule. They don't need approval from staff unless it's a special event.
Other — your own answer
What can we leave out until next year?*
Select all that apply
Mobile app for booking classes.
Members use their browsers on desktop or laptop computers to sign up for classes. We skip having a special app made now.
Instructor ratings and reviews.
Gym members don't get to rate instructors until after we handle the basics of scheduling and booking.
Other — your own answer
Who will build this app?*
Select one
The gym owner.
Owner learns to code the whole system by themselves over several months.
A freelance web developer.
Developer works closely with gym staff and makes sure everything fits their needs, especially handling schedules every Monday.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### tasks — the drafted document

```
## Overview

The proposed website application aims to streamline the administration and operations of small climbing gyms by providing two primary functionalities:
1. **Scheduling Instructors’ Work Hours**: Gym owners can create weekly schedules for instructors based on gym operations, with features such as drag-and-drop interface capabilities.
2. **Booking System for Clients**: The system allows clients to find open slots easily, check pricing structures and gym policies, and receive automatic booking confirmations via notifications or emails.

The application is designed to support real-time syncing among all its interfaces ensuring the same data consistency across the board and making it easy for users of different levels to interact without manual tracking efforts.
 
This tool aims to be simple, reliable, scalable, secure, and transparent for clients as well as gym staff. It will enhance operational efficiency in small climbing gyms by digitizing time-consuming administrative tasks like scheduling and booking management.

## Requirement Coverage

The application includes several modules designed based on user requirements gathered through interviews, documents, and project vision:

1. **Scheduling Instructor Work Hours (MON_SCHEDULE_CREATE)**
   - Gym owners can designate working hours on a weekly basis with a feature to lock or unlock specific blocks.
   
2. **Availability Search & Booking System (BROWSER_FIND_AVAILABILITY)**
   - Clients can search for available time slots in the booking system via an intuitive interface, ensuring easy access and visibility of vacant times.

3. **Data Consistency Across All Interfaces (SAME_INFO_EVERYONE)**
   - Real-time syncing across all interfaces is achieved through automated updates so that any modification made on one platform is immediately updated across others for consistency.
   
4. **Integration with Existing Tools: Excel Spreadsheets, Mobile Devices** 
    - The web app will be integrated with existing tools such as Excel spreadsheets and other productivity tools (e.g., Google Sheets), ensuring data synchronization and compatibility with various mobile devices.

5. **User Roles & Permissions**
   - Different roles will have specific permissions; Gym owners can manage instructor schedules, class offerings, and booking availabilities while instructors only view personal schedules.
   
6. **Non-user Interface Requirements:**
    - Features include financial transaction gateways for secure handling of client
```

### tasks — the review board

```
TASKS · REVIEW

needs revision

Tick the points you want applied, then choose. Nothing advances until you decide.

Must fix (1)
Requirement Coverage · line 16
The requirement for scheduling instructor work hours via MON_SCHEDULE_CREATE is unclear and not detailed enough to specify whether it should include automatic adjustments or manual overrides.
Clarify if the feature will allow for automatic adjustments based on client booking data or require manual overrides. Also specify how instructors can view and adjust their own schedules, if at all permitted.
Recommendations (1)
Requirement Coverage · line 35
The requirement mentioning integration with Excel and Google Sheets needs more specifics on how this data interchange will be handled.
Add details about the file formats used for exporting/importing schedule data (e.g., CSV), API protocols supported or planned (e.g., Google Sheets API) and how to manage conflicting modifications from multiple sources.
Accept
Ignore
Request changes

Requesting changes needs at least one point ticked — only the ticked ones are applied.
```
