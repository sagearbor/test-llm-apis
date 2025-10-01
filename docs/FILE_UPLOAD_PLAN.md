# File Upload Feature - Development Plan

## Overview

Add ability for users to upload files (documents, code, images) and ask the LLM to analyze them.

---

## Security Considerations (CRITICAL)

### 🔴 Major Security Risks:
1. **Malicious File Upload**: Users could upload executable files, scripts, malware
2. **File Size Bombs**: Large files could exhaust memory/storage
3. **Path Traversal**: Malicious filenames could access server files
4. **Code Injection**: File content could contain malicious code
5. **PII/Sensitive Data**: Users might upload confidential documents
6. **Storage Costs**: Files need to be stored temporarily
7. **Cross-User Access**: User A shouldn't access User B's files

### ✅ Security Mitigations:

#### 1. File Type Restrictions
- **Whitelist only**: .txt, .md, .pdf, .docx, .py, .js, .java, .cpp, .csv, .json, .xml
- **Block**: .exe, .sh, .bat, .cmd, .ps1, .dll, .so, .app
- **Validate MIME type** (not just extension)

#### 2. File Size Limits
- **Max file size**: 10MB (configurable)
- **Max files per user**: 5 concurrent
- **Rate limiting**: Max 10 uploads per hour per user

#### 3. File Storage
- **Temporary storage**: Files deleted after analysis
- **Session-based**: Each user's files isolated by session ID
- **Auto-cleanup**: Delete files after 1 hour or on logout
- **No persistent storage**: Files never saved to disk permanently

#### 4. Content Sanitization
- **Strip metadata**: Remove EXIF, author info, etc.
- **Scan for malicious content**: Basic virus/malware check
- **Text extraction only**: Convert all files to plain text before LLM
- **No code execution**: Never execute uploaded code

#### 5. Access Control
- **Session isolation**: Files tagged with session ID
- **OAuth required**: Must be authenticated to upload
- **User-specific paths**: Each user has isolated temp directory
- **Auto-delete on logout**: Clean up all user files

#### 6. Azure OpenAI Safety
- **Content filters**: Azure's built-in safety filters
- **No file persistence in prompts**: Files processed, then discarded
- **Audit logging**: Log all file uploads with user ID

---

## Architecture Design

### File Processing Flow:
```
1. User uploads file (browser)
   ↓
2. Server validates file (type, size, MIME)
   ↓
3. Store in temporary session-specific directory
   ↓
4. Extract text content (convert PDF, DOCX, etc. to text)
   ↓
5. Sanitize content (remove metadata, check for malicious content)
   ↓
6. Send to Azure OpenAI with user's question
   ↓
7. Return response to user
   ↓
8. Auto-delete file after response OR 1 hour timeout
```

### Storage Strategy:
- **Option A**: In-memory storage (simplest, no disk I/O)
  - Pros: Fast, no cleanup needed, secure
  - Cons: Lost on restart, limited by RAM

- **Option B**: Temporary disk storage (recommended)
  - Pros: Handles large files, survives restart
  - Cons: Need cleanup mechanism
  - Location: `/tmp/llm-uploads/{sessionId}/{fileId}`

**Recommendation**: Option B with aggressive cleanup

### File Structure:
```
/tmp/llm-uploads/
  ├── {session-id-1}/
  │   ├── {file-id-1}.txt
  │   └── {file-id-2}.pdf.txt
  └── {session-id-2}/
      └── {file-id-3}.json
```

---

## Technical Implementation

### Backend Changes:

#### 1. New Dependencies
```bash
npm install multer         # File upload middleware
npm install file-type      # MIME type detection
npm install pdf-parse      # PDF text extraction
npm install mammoth        # DOCX text extraction
npm install sanitize-filename  # Secure filenames
```

#### 2. New API Endpoints

**POST /api/upload**
- Upload file
- Returns: `{ fileId, filename, size, uploadedAt }`

**POST /chat** (modified)
- Accept optional `fileId` parameter
- Include file content in LLM prompt

**DELETE /api/files/:fileId**
- Manually delete uploaded file

**GET /api/files**
- List user's uploaded files

#### 3. New Modules

**`file-processor.js`**
- Extract text from various file types
- Sanitize content
- Validate file safety

**`upload-middleware.js`**
- Multer configuration
- File validation
- Size/type restrictions

**`cleanup-service.js`**
- Background job to delete old files
- Run every 10 minutes
- Delete files older than 1 hour

### Frontend Changes:

#### 1. UI Components

**File Upload Area**
- Drag-and-drop zone
- File picker button
- File list with delete buttons
- Progress indicator
- File size/type validation (client-side)

**Updated Chat Interface**
- Show attached files in chat
- Clear visual indicator when file is included
- Option to remove file from context

#### 2. Client-Side Validation
- Check file size before upload
- Check file extension
- Show errors immediately

---

## Development Checklist

### Phase 1: Backend Foundation ✓ = Done, ⏳ = In Progress, ☐ = To Do

#### Setup & Dependencies
- [ ] Install required npm packages
  - [ ] multer
  - [ ] file-type
  - [ ] pdf-parse
  - [ ] mammoth
  - [ ] sanitize-filename
- [ ] Update package.json
- [ ] Test all dependencies install correctly

#### File Upload Endpoint
- [ ] Create `upload-middleware.js`
  - [ ] Configure multer for temp storage
  - [ ] Set file size limit (10MB)
  - [ ] Set file type whitelist
  - [ ] Add MIME type validation
  - [ ] Add rate limiting per user
- [ ] Create POST /api/upload endpoint
  - [ ] Validate file type/size
  - [ ] Generate secure file ID (UUID)
  - [ ] Store in session-specific directory
  - [ ] Return file metadata
  - [ ] Add error handling
  - [ ] Add OAuth protection (requireAuth)
- [ ] Test file upload with curl/Postman

#### File Processing
- [ ] Create `file-processor.js`
  - [ ] Text file reader (.txt, .md, .json, .xml, .csv)
  - [ ] PDF text extractor (pdf-parse)
  - [ ] DOCX text extractor (mammoth)
  - [ ] Code file reader (.py, .js, .java, .cpp, etc.)
  - [ ] Metadata stripper
  - [ ] Content sanitizer (remove suspicious patterns)
  - [ ] Size limiter for extracted text (max 50K chars)
- [ ] Add file type detection (file-type)
- [ ] Add filename sanitization
- [ ] Test with various file types

#### Chat Integration
- [ ] Modify POST /chat endpoint
  - [ ] Accept optional fileId parameter
  - [ ] Load file content if fileId provided
  - [ ] Prepend file content to user prompt
  - [ ] Include file context in LLM message
  - [ ] Handle file not found errors
  - [ ] Track file usage in logs
- [ ] Test chat with file context

#### File Management
- [ ] Create GET /api/files endpoint
  - [ ] List user's uploaded files (session-based)
  - [ ] Return file metadata (id, name, size, uploadedAt)
  - [ ] Filter by session ID
- [ ] Create DELETE /api/files/:fileId endpoint
  - [ ] Validate user owns file (session check)
  - [ ] Delete file from disk
  - [ ] Return success/error
- [ ] Test file listing and deletion

#### Cleanup Service
- [ ] Create `cleanup-service.js`
  - [ ] Background job (setInterval every 10 min)
  - [ ] Find files older than 1 hour
  - [ ] Delete expired files
  - [ ] Delete empty session directories
  - [ ] Log cleanup activity
- [ ] Integrate cleanup service in server.js
- [ ] Add cleanup on server shutdown
- [ ] Add cleanup on user logout
- [ ] Test cleanup runs correctly

### Phase 2: Frontend Implementation

#### UI Components
- [ ] Create file upload component
  - [ ] Drag-and-drop zone
  - [ ] File picker button
  - [ ] File type/size validation (client-side)
  - [ ] Upload progress indicator
  - [ ] Error messages
  - [ ] Success confirmation
- [ ] Add file upload area to index.html
  - [ ] Position above chat input
  - [ ] Styling to match existing UI
- [ ] Create uploaded files list component
  - [ ] Show filename, size, upload time
  - [ ] Delete button per file
  - [ ] Visual indicator when file is in context
- [ ] Test UI responsiveness

#### Chat Integration
- [ ] Modify sendMessage() function
  - [ ] Include selected fileId in request
  - [ ] Show file badge in chat message
  - [ ] Clear file selection after send (optional)
- [ ] Add file context indicator
  - [ ] Show "📎 File attached" in chat
  - [ ] Allow removing file from context
- [ ] Test chat with and without files

#### Client-Side Validation
- [ ] Implement file size check (before upload)
- [ ] Implement file type check (before upload)
- [ ] Show validation errors to user
- [ ] Disable upload button while uploading
- [ ] Test validation edge cases

### Phase 3: Security & Testing

#### Security Implementation
- [ ] Add CSRF protection for file uploads
- [ ] Implement per-user rate limiting
  - [ ] Max 10 uploads per hour
  - [ ] Return 429 Too Many Requests
- [ ] Add session-based file isolation
  - [ ] Files stored in /tmp/llm-uploads/{sessionId}/
  - [ ] Users can only access own files
  - [ ] Test cross-session access prevention
- [ ] Add file content scanning
  - [ ] Check for common malware signatures
  - [ ] Block suspicious patterns
  - [ ] Test with various payloads
- [ ] Ensure OAuth is required for all file endpoints
- [ ] Test security with malicious inputs

#### Security Testing
- [ ] Test with oversized files (should reject)
- [ ] Test with blocked file types (.exe, .sh, etc.)
- [ ] Test with malformed filenames (../, %00, etc.)
- [ ] Test path traversal attempts
- [ ] Test concurrent uploads (rate limit)
- [ ] Test cross-user access attempts
- [ ] Test with very long filenames
- [ ] Test with binary files
- [ ] Test with empty files
- [ ] Test with corrupted PDFs/DOCX

#### Functional Testing
- [ ] Test upload flow end-to-end
- [ ] Test chat with file context
- [ ] Test file deletion
- [ ] Test file listing
- [ ] Test cleanup service
- [ ] Test with multiple file types
  - [ ] .txt files
  - [ ] .pdf files
  - [ ] .docx files
  - [ ] .json files
  - [ ] .py code files
  - [ ] .md files
- [ ] Test with large files (near 10MB limit)
- [ ] Test error handling
  - [ ] Network errors
  - [ ] Storage full
  - [ ] Invalid file types
  - [ ] LLM API errors with file context

### Phase 4: Documentation & Deployment

#### Documentation
- [ ] Create `docs/FILE_UPLOAD_SECURITY.md`
  - [ ] Explain security measures
  - [ ] Document file type whitelist
  - [ ] Explain storage/cleanup strategy
  - [ ] IT approval checklist
- [ ] Update `README.md`
  - [ ] Add file upload feature description
  - [ ] Note security considerations
- [ ] Update `docs/SECURITY_CHECKLIST.md`
  - [ ] Add file upload security section
- [ ] Add JSDoc comments to all new functions
- [ ] Update API documentation

#### Docker Support
- [ ] Update Dockerfile
  - [ ] Ensure /tmp directory is writable
  - [ ] Add cleanup script to entrypoint
- [ ] Test file upload in Docker container
- [ ] Update docker-compose.yml if needed
- [ ] Test cleanup service in Docker

#### Configuration
- [ ] Add environment variables
  - [ ] MAX_FILE_SIZE (default 10MB)
  - [ ] MAX_FILES_PER_USER (default 5)
  - [ ] FILE_RETENTION_HOURS (default 1)
  - [ ] UPLOAD_RATE_LIMIT (default 10/hour)
- [ ] Update .env.example
- [ ] Add configuration to config.js

#### Deployment Prep
- [ ] Test on local Docker
- [ ] Test on VM deployment
- [ ] Verify cleanup service runs
- [ ] Check logs for errors
- [ ] Performance test (multiple concurrent uploads)
- [ ] Memory usage test (large files)

### Phase 5: Polish & Review

#### Code Quality
- [ ] Run npm audit for vulnerabilities
- [ ] Add error logging
- [ ] Add usage metrics logging
- [ ] Code review checklist
  - [ ] No hardcoded secrets
  - [ ] Proper error handling everywhere
  - [ ] Input validation on all endpoints
  - [ ] OAuth required on all endpoints
  - [ ] File paths sanitized
  - [ ] No code execution paths
- [ ] Test edge cases

#### User Experience
- [ ] Add loading states
- [ ] Add helpful error messages
- [ ] Add file upload tutorial/tooltip
- [ ] Test with slow network
- [ ] Test on mobile browsers
- [ ] Add keyboard shortcuts (optional)

#### Final Testing
- [ ] Full regression test
- [ ] Test all existing features still work
- [ ] Test OAuth flow with file upload
- [ ] Test health check endpoint
- [ ] Test with all 4 LLM models
- [ ] Load test (many concurrent users)

---

## Implementation Timeline

**Estimated time**: 6-8 hours total

- **Phase 1**: Backend Foundation (2-3 hours)
- **Phase 2**: Frontend Implementation (1.5-2 hours)
- **Phase 3**: Security & Testing (2-3 hours)
- **Phase 4**: Documentation & Deployment (0.5-1 hour)
- **Phase 5**: Polish & Review (0.5-1 hour)

---

## Configuration

### Environment Variables

```bash
# File Upload Configuration
MAX_FILE_SIZE_MB=10
MAX_FILES_PER_USER=5
FILE_RETENTION_HOURS=1
UPLOAD_RATE_LIMIT_PER_HOUR=10
ALLOWED_FILE_TYPES=.txt,.md,.pdf,.docx,.py,.js,.java,.cpp,.csv,.json,.xml
```

---

## Success Criteria

- [ ] Users can upload files via UI
- [ ] Supported file types work correctly
- [ ] Files are included in LLM context
- [ ] Files are automatically cleaned up
- [ ] Security tests all pass
- [ ] IT approves security measures
- [ ] No performance degradation
- [ ] Documentation complete
- [ ] Works in Docker deployment

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Malicious file upload | Medium | High | Strict file type whitelist, content scanning |
| Storage exhaustion | Low | Medium | File size limits, aggressive cleanup |
| Privacy concerns | Medium | High | Session isolation, auto-delete, no logging of content |
| PII leakage | Medium | High | Warning messages, OAuth required, audit logs |
| Performance issues | Medium | Medium | Streaming, size limits, rate limiting |
| Cross-user access | Low | High | Session-based isolation, OAuth checks |

---

## Open Questions

1. Should files persist across page refresh? (Current plan: No, tied to session)
2. Should we support ZIP files? (Initial: No, security risk)
3. Should we scan for PII automatically? (Initial: No, just warn users)
4. Should we allow multiple files per message? (Initial: One file per message)
5. Should we support images? (Initial: Yes, but convert to text description via GPT-4 Vision if available)

---

## Future Enhancements (Out of Scope)

- [ ] Support for ZIP files (with extraction)
- [ ] Image analysis with GPT-4 Vision
- [ ] File sharing between users
- [ ] Persistent file storage
- [ ] File version history
- [ ] Collaborative document analysis
- [ ] Integration with OneDrive/SharePoint
- [ ] Real-time collaborative editing
