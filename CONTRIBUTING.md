# Contributing to MRU Hacks 2026

Thank you for your interest in contributing to the MRU Hacks 2026 platform! This document provides guidelines and best practices for development.

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Test your changes
7. Submit a pull request

## 📝 Development Guidelines

### Code Style

- **TypeScript**: All new files should use TypeScript
- **Formatting**: Code is automatically formatted with ESLint
- **Naming Conventions**:
  - Components: PascalCase (e.g., `UserProfile.tsx`)
  - Files: kebab-case for utilities (e.g., `action-result.ts`)
  - Functions: camelCase (e.g., `getUser()`)
  - Constants: UPPER_SNAKE_CASE (e.g., `MOBILE_BREAKPOINT`)

### Component Guidelines

- Use functional components with hooks
- Keep components small and focused on a single responsibility
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props
- Add JSDoc comments for complex components

Example:

```typescript
/**
 * Displays user information in the sidebar footer
 * @param user - User object containing name, email, and optional avatar
 */
export function NavUser({ user }: { user: UserInfo }) {
  // Component implementation
}
```

### Server Actions

- All server actions should be marked with `"use server"`
- Use the `ActionResult` type for consistent return values
- Validate all inputs using Zod schemas
- Handle errors gracefully with meaningful messages
- Include JSDoc comments describing the action

Example:

```typescript
/**
 * Registers a new participant for the hackathon
 * @param formData - Validated registration form data
 * @returns ActionResult indicating success or failure
 */
export async function registerParticipant(
  formData: RegistrationFormValues,
): Promise<ActionResult> {
  // Implementation
}
```

### Database Schema

- Use descriptive table and column names
- Add indexes for frequently queried columns
- Document relationships with JSDoc comments
- Use proper constraints (foreign keys, unique, not null)
- Keep lookup tables in `lookups.ts`

### Git Workflow

1. **Branch Naming**:
   - Features: `feature/description`
   - Fixes: `fix/description`
   - Docs: `docs/description`

2. **Commit Messages**:
   - Use clear, descriptive commit messages
   - Start with a verb in present tense
   - Keep the first line under 72 characters
   - Examples:
     - `Add participant registration form`
     - `Fix authentication redirect loop`
     - `Update README with setup instructions`

3. **Pull Requests**:
   - Reference related issues
   - Provide a clear description of changes
   - Include screenshots for UI changes
   - Ensure all tests pass
   - Request review from maintainers

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npx vitest

# Run tests in watch mode
npx vitest --watch

# Run specific test file
npx vitest src/tests/getDatabaseURL.test.ts
```

### Writing Tests

- Write tests for new utility functions
- Test edge cases and error conditions
- Use descriptive test names
- Follow the existing test structure

Example:

```typescript
describe('myFunction', () => {
  it('returns expected value for valid input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('throws error for invalid input', () => {
    expect(() => myFunction(null)).toThrow('Error message');
  });
});
```

## 🔍 Code Review Checklist

Before submitting a PR, ensure:

- [ ] Code follows the style guidelines
- [ ] All tests pass
- [ ] New code has appropriate JSDoc comments
- [ ] No console.log or debugging code remains
- [ ] Environment variables are documented
- [ ] Database migrations are included if schema changed
- [ ] README updated if new features added
- [ ] Linting passes: `npm run lint`

## 🐛 Bug Reports

When reporting bugs, include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Detailed steps to reproduce the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: Node version, OS, browser (if applicable)
6. **Screenshots**: If applicable

## 💡 Feature Requests

When proposing features:

1. **Use Case**: Describe the problem being solved
2. **Proposed Solution**: How you envision the feature working
3. **Alternatives**: Other solutions you considered
4. **Additional Context**: Any relevant information

## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## 📞 Getting Help

If you need help:

- Check existing issues and discussions
- Review the documentation
- Ask questions in pull request comments
- Contact maintainers directly for sensitive issues

Thank you for contributing to MRU Hacks 2026!
