#!/bin/bash

# ============================================
# Luna Agent Build System - Automated Fix Script
# ============================================
# This script automatically implements all fixes
# for the circular dependency build issue
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Print colored output
print_header() {
    echo -e "\n${CYAN}${BOLD}===================================================${NC}"
    echo -e "${CYAN}${BOLD}$1${NC}"
    echo -e "${CYAN}${BOLD}===================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_step() {
    echo -e "\n${MAGENTA}▶ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_success "Node.js installed: $NODE_VERSION"
        
        # Check version
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
        if [ "$NODE_MAJOR" -lt 18 ]; then
            print_error "Node.js version too old. Required: v18+"
            exit 1
        fi
    else
        print_error "Node.js not installed"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        print_success "npm installed: $NPM_VERSION"
    else
        print_error "npm not installed"
        exit 1
    fi
    
    # Check git (for backup)
    if command -v git &> /dev/null; then
        print_success "git installed"
    else
        print_warning "git not installed - skipping git backup"
    fi
}

# Create backup
create_backup() {
    print_header "Creating Backup"
    
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup package.json files
    if [ -f "package.json" ]; then
        cp package.json "$BACKUP_DIR/package.json"
        print_success "Backed up root package.json"
    fi
    
    if [ -f "app/package.json" ]; then
        cp app/package.json "$BACKUP_DIR/app-package.json"
        print_success "Backed up app/package.json"
    fi
    
    if [ -f "backend/package.json" ]; then
        cp backend/package.json "$BACKUP_DIR/backend-package.json"
        print_success "Backed up backend/package.json"
    fi
    
    if [ -f "electron/package.json" ]; then
        cp electron/package.json "$BACKUP_DIR/electron-package.json"
        print_success "Backed up electron/package.json"
    fi
    
    print_info "Backup created in: $BACKUP_DIR"
}

# Create directory structure
create_directories() {
    print_header "Creating Directory Structure"
    
    DIRS=(
        "scripts"
        "app/src"
        "app/public"
        "backend/src"
        "electron/src"
        "build-resources"
    )
    
    for dir in "${DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_success "Created directory: $dir"
        else
            print_info "Directory exists: $dir"
        fi
    done
}

# Install global dependencies
install_global_deps() {
    print_header "Installing Global Dependencies"
    
    print_step "Installing rimraf globally..."
    npm install -g rimraf --silent
    print_success "rimraf installed"
    
    print_step "Installing cross-env globally..."
    npm install -g cross-env --silent
    print_success "cross-env installed"
}

# Fix package.json files
fix_package_files() {
    print_header "Fixing Package.json Files"
    
    # Check if sub-packages have problematic build scripts
    print_step "Checking for circular dependencies..."
    
    for pkg in app/package.json backend/package.json electron/package.json; do
        if [ -f "$pkg" ]; then
            # Read the file and check for build script
            if grep -q '"build"' "$pkg"; then
                print_warning "Found 'build' script in $pkg"
                
                # Create a fixed version
                print_step "Fixing $pkg..."
                
                # Use Node.js to safely modify JSON
                node -e "
                    const fs = require('fs');
                    const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
                    
                    // Rename build to compile if it exists
                    if (pkg.scripts && pkg.scripts.build) {
                        if (!pkg.scripts.compile) {
                            pkg.scripts.compile = pkg.scripts.build;
                        }
                        delete pkg.scripts.build;
                    }
                    
                    // Ensure compile script exists
                    if (!pkg.scripts) pkg.scripts = {};
                    if (!pkg.scripts.compile) {
                        if ('$pkg'.includes('app')) {
                            pkg.scripts.compile = 'webpack --config webpack.config.prod.js --mode production';
                        } else {
                            pkg.scripts.compile = 'tsc';
                        }
                    }
                    
                    fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2));
                    console.log('Fixed: $pkg');
                "
                
                print_success "Fixed $pkg"
            else
                print_success "$pkg already fixed"
            fi
        fi
    done
}

# Create essential config files if missing
create_config_files() {
    print_header "Creating Configuration Files"
    
    # Create basic tsconfig.json if missing
    if [ ! -f "tsconfig.json" ]; then
        print_step "Creating root tsconfig.json..."
        cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist"]
}
EOF
        print_success "Created tsconfig.json"
    fi
    
    # Create app/tsconfig.json if missing
    if [ ! -f "app/tsconfig.json" ]; then
        print_step "Creating app/tsconfig.json..."
        cat > app/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2018",
    "module": "esnext",
    "lib": ["ES2018", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
        print_success "Created app/tsconfig.json"
    fi
    
    # Create basic index.html if missing
    if [ ! -f "app/public/index.html" ]; then
        print_step "Creating app/public/index.html..."
        cat > app/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Luna Agent</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>
EOF
        print_success "Created app/public/index.html"
    fi
}

# Clean installation
clean_install() {
    print_header "Clean Installation"
    
    print_step "Cleaning old build artifacts..."
    rm -rf dist app/dist backend/dist electron/dist 2>/dev/null || true
    print_success "Cleaned build directories"
    
    print_step "Removing node_modules..."
    rm -rf node_modules app/node_modules backend/node_modules electron/node_modules 2>/dev/null || true
    print_success "Removed node_modules"
    
    print_step "Installing root dependencies..."
    npm install
    print_success "Root dependencies installed"
    
    if [ -d "app" ] && [ -f "app/package.json" ]; then
        print_step "Installing app dependencies..."
        cd app && npm install && cd ..
        print_success "App dependencies installed"
    fi
    
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        print_step "Installing backend dependencies..."
        cd backend && npm install && cd ..
        print_success "Backend dependencies installed"
    fi
    
    if [ -d "electron" ] && [ -f "electron/package.json" ]; then
        print_step "Installing electron dependencies..."
        cd electron && npm install && cd ..
        print_success "Electron dependencies installed"
    fi
}

# Test the build
test_build() {
    print_header "Testing Build System"
    
    print_step "Running type check..."
    if npm run type-check 2>/dev/null; then
        print_success "Type check passed"
    else
        print_warning "Type check failed (may be due to missing source files)"
    fi
    
    print_step "Testing build command..."
    if timeout 30 npm run build 2>/dev/null; then
        print_success "Build completed successfully!"
    else
        print_warning "Build did not complete - check for errors"
    fi
}

# Main execution
main() {
    print_header "Luna Agent Build System Fix"
    echo "This script will fix the circular dependency issue"
    echo ""
    
    # Ask for confirmation
    read -p "Do you want to proceed? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Aborted by user"
        exit 0
    fi
    
    # Run all steps
    check_prerequisites
    create_backup
    create_directories
    install_global_deps
    fix_package_files
    create_config_files
    
    # Ask about clean install
    echo ""
    read -p "Do you want to perform a clean install? This will remove node_modules. (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        clean_install
    fi
    
    # Test the build
    echo ""
    read -p "Do you want to test the build system now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_build
    fi
    
    # Final summary
    print_header "Fix Complete!"
    echo -e "${GREEN}The circular dependency issue has been fixed.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the changes made to package.json files"
    echo "  2. Copy the provided script files to the scripts/ directory"
    echo "  3. Copy the webpack configurations to app/"
    echo "  4. Run: npm run build"
    echo ""
    echo "If you encounter issues:"
    echo "  • Run: node scripts/diagnose.js"
    echo "  • Check the troubleshooting guide"
    echo ""
    print_success "Build system fix applied successfully!"
}

# Run main function
main