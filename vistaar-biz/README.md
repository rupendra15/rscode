# Vistaar-Biz

Vistaar-Biz uses a React UI with a Java Spring Boot backend and an application-owned PostgreSQL database.

## Architecture

React / Next.js UI -> Java Spring Boot API -> PostgreSQL

Core application data and authentication are owned by Vistaar-Biz. There is no Supabase, Firebase, hosted authentication, or managed database dependency.

## Local setup

### 1. PostgreSQL
Install PostgreSQL locally and create the database/user:

    CREATE USER vistaar WITH PASSWORD 'vistaar';
    CREATE DATABASE vistaar_biz OWNER vistaar;

### 2. Java backend
Requirements: JDK 21, Maven 3.9+, PostgreSQL 16+.

    cd backend
    mvn spring-boot:run

The Java API starts on http://localhost:8080. Flyway creates the Vistaar schema automatically.

Internal accounts are created automatically:

    Admin: admin@vistaar.biz / admin123
    Manager: manager@vistaar.biz / admin123

### 3. React UI

    cd vistaar-biz
    npm install
    npm run dev

The UI runs on http://localhost:3000 and proxies application APIs to Java. Set VISTAAR_BACKEND_URL only when Java is not at http://localhost:8080.

## Production
Run PostgreSQL and the Java API on infrastructure controlled by Vistaar. The React UI can be deployed separately. No application data or authentication needs to be hosted by a third party.
